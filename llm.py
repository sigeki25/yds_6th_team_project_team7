import json
from datetime import date

from langchain_core.messages import HumanMessage, AIMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_ollama import ChatOllama

def get_llm(temperature:float=0.2, format:str|None=None) -> ChatOllama:
    return ChatOllama(
        model="gemma4:e4b",
        temperature=temperature,
        format=format,          # "json" 이면 모델이 JSON 으로만 답하도록 강제
        timeout=120.0,
        client_kwargs={
            "timeout": 120.0,
        },
    )

# 대화 기록은 최근 몇 개까지만 사용 (길수록 느려지고 메모리 부족으로 멈출 수 있음)
MAX_HISTORY = 10

def to_messages(history:list[dict]) -> list:
    """화면에서 받은 대화 기록을 LangChain 메시지로 바꿈

    history 예: [{"role": "user", "content": "강릉 가고 싶어요"},
                 {"role": "assistant", "content": "좋아요! ..."}]
    """
    messages = []
    for h in history[-MAX_HISTORY:]:
        if h['role'] == 'user':
            messages.append(HumanMessage(content=h['content']))
        else:
            messages.append(AIMessage(content=h['content']))
    return messages

#프롬프트 작성
prompt = ChatPromptTemplate.from_messages([
    ("system",  """당신은 '지역 코스 지도' 서비스의 AI 코스 도우미입니다.
  사용자와 대화하며 국내 여행 코스를 함께 정한다.

  [규칙]
  1. 여행 코스와 관련된 질문에만 답한다.
  2. 여행과 관련 없는 질문(주식, 숙제, 코딩, 날씨 등)에는 아래 문장만 그대로 답한다.
     "여행 코스 만들기만 도와드릴 수 있어요. 가고 싶은 지역을 말씀해 주세요."
  3. 지역이나 시간(반나절/하루)을 모르면 한 번만 짧게 되묻는다.
  4. 방문 날짜를 말하지 않으면 오늘 간다고 생각한다.
  5. 운영시간, 요금, 전화번호처럼 모르는 정보는 지어내지 말고 "방문 전 확인해 주세요"라고 한다.
  6. 답은 3문장 이내로 짧게 한다. 마크다운(**, #, -)과 이모지는 쓰지 않는다.
  

  [예시]
  사용자: 부모님이랑 여행 가고 싶어요
  도우미: 좋아요! 어느 지역으로, 반나절과 하루 중 얼마나 다녀오실 예정인가요?

  사용자: 오늘 주식 뭐 사면 돼?
  도우미: 여행 코스 만들기만 도와드릴 수 있어요. 가고 싶은 지역을 말씀해 주세요.

  사용자: 서산에서 하루, 바다 보고 싶어요
  도우미: 서산에서 바다를 볼 수 있는 하루 코스를 찾아볼게요. 함께 가시는 분이 있나요?
  """),
    MessagesPlaceholder(variable_name="history"),
    ("user","{query}")
])

chain = prompt | get_llm()

# AI 호출이 실패했을 때 보여 줄 문구 (CM10-8)
AI_ERROR_MESSAGE = "AI 응답이 잠시 불안정해요. 잠시 후 다시 시도해 주세요."

def chat_answer(query:str, history:list[dict] | None = None) -> str:
    try:
        answer = chain.invoke({'query':query,'history':to_messages(history or [])}).content
    except Exception:  # 타임아웃, 모델 프로세스 종료 등
        return AI_ERROR_MESSAGE
    return answer

# 조건 뽑기 프롬프트 (JSON 중괄호는 {{ }} 로 두 번 씀)
extract_prompt = ChatPromptTemplate.from_messages([
    ("system", """대화를 읽고 사용자의 여행 조건을 JSON으로만 답한다. 설명은 쓰지 않는다.
사용자가 말하지 않은 값은 null 로 둔다. 추측하지 않는다.
단, 사용자가 말한 바람(보고 싶다, 먹고 싶다, ~위주로, ~하게)은 빠짐없이 preference 에 넣는다.
오늘 날짜는 {today} 이다. 연도를 말하지 않으면 오늘 이후의 가장 가까운 날짜로 쓴다.

{{"off_topic": 여행과 관련 없는 질문이면 true, 아니면 false,
  "region": 지역 이름(예: "강릉") 또는 null,
  "duration": "half"(반나절) 또는 "day"(하루) 또는 null,
  "companion": 함께 가는 사람(예: "부모님") 또는 null,
  "preference": 보고 싶은 것, 하고 싶은 것, 먹고 싶은 것, 원하는 분위기
                (예: "바다", "맛집", "걷기 편하게", "조용한 곳") 또는 null,
  "date": 방문 날짜 "YYYY-MM-DD" 또는 null}}

[예시]
사용자: 부모님이랑 강릉에서 하루, 바다 보고 싶어요
{{"off_topic": false, "region": "강릉", "duration": "day", "companion": "부모님", "preference": "바다", "date": null}}

사용자: 전주에서 맛집 위주로 반나절
{{"off_topic": false, "region": "전주", "duration": "half", "companion": null, "preference": "맛집", "date": null}}

사용자: 걷기 편하고 조용한 곳이면 좋겠어요
{{"off_topic": false, "region": null, "duration": null, "companion": null, "preference": "걷기 편함, 조용한 곳", "date": null}}

사용자: 오늘 주식 뭐 사면 돼?
{{"off_topic": true, "region": null, "duration": null, "companion": null, "preference": null, "date": null}}
"""),
    MessagesPlaceholder(variable_name="history"),
    ("user", "{query}"),
])

extract_chain = extract_prompt | get_llm(temperature=0, format="json")

# 모든 값이 비어 있는 기본 조건
EMPTY_CONDITIONS = {'off_topic': False, 'region': None, 'duration': None,
                    'companion': None, 'preference': None, 'date': None}

def fix_date(value, today:date) -> str | None:
    """
    모델이 날짜를 틀리게 뽑는 경우 차단
    방문 날짜 보정: 형식이 틀리면 None, 지난 날짜면 올해(그래도 지났으면 내년)로"""
    try:
        visit = date.fromisoformat(value)
        if visit < today:
            visit = visit.replace(year=today.year)
        if visit < today:
            visit = visit.replace(year=today.year + 1)
    except (TypeError, ValueError):  # None, "다음 주" 같은 글자, 2월 29일 등
        return None
    return visit.isoformat()

def extract_conditions(query:str, history:list[dict] | None = None) -> dict | None:
    """대화에서 여행 조건을 뽑음. 두 번 다 실패하면 None (부르는 쪽에서 AI_ERROR_MESSAGE 안내)"""
    today = date.today()
    for _ in range(2):  # 실패하거나 형식이 틀리면 한 번 더 시도 (CM10-8)
        try:
            text = extract_chain.invoke({'query':query,'history':to_messages(history or []),'today':today.isoformat()}).content
        except Exception:  # 타임아웃, 모델 프로세스 종료 등
            continue
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            continue
        if not isinstance(data, dict):  # 리스트, 글자, 숫자 등이 오면 형식 오류로 보고 재시도
            continue
        # 정해진 키만 남기고, 없는 키는 기본값으로
        conditions = {key: data.get(key, value) for key, value in EMPTY_CONDITIONS.items()}
        if conditions['duration'] not in ('half', 'day'):
            conditions['duration'] = None
        conditions['date'] = fix_date(conditions['date'], today)
        return conditions
    return None


