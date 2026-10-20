from langchain_ollama import ChatOllama

def get_llm(temperature:float=0.2) -> ChatOllama:
    return ChatOllama(
        model="gemma4:e4b",
        temperature=temperature,
        timeout=120.0,
        client_kwargs={
            "timeout": 120.0,
        },
    )