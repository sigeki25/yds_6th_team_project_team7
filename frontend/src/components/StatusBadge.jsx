import { STATUS } from "../lib/festival.js";

/** CM20-3 개최 상태 배지 */
export default function StatusBadge({ status, label }) {
  return <span className={`badge badge--${status}`}>{label ?? STATUS[status].label}</span>;
}
