import { Link } from "react-router";
import { festivalStatus, formatPeriodShort, regionLabel } from "../lib/festival.js";
import FallbackImage from "./FallbackImage.jsx";
import StatusBadge from "./StatusBadge.jsx";

/** CM20-2 축제 카드 (H110 · L110 공통) */
export default function FestivalCard({ festival: f }) {
  return (
    <Link className="festival-card" to={`/festivals/${encodeURIComponent(f.id)}`}>
      <div className="festival-card__poster">
        <FallbackImage src={f.image} loading="lazy" />
        <StatusBadge status={festivalStatus(f)} />
      </div>
      <div className="festival-card__body">
        <h3 className="festival-card__title" title={f.title}>{f.title}</h3>
        <p className="festival-card__meta">{formatPeriodShort(f.startDate, f.endDate)}</p>
        <p className="festival-card__meta">{regionLabel(f)}</p>
      </div>
    </Link>
  );
}

export function FestivalCardSkeleton() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <div className="skeleton skeleton-card__poster" />
      <div className="skeleton skeleton-card__line" />
      <div className="skeleton skeleton-card__line skeleton-card__line--short" />
    </div>
  );
}
