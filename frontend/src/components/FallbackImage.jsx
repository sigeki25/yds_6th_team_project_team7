import { useState } from "react";
import { NO_IMAGE } from "../lib/festival.js";

/** 이미지가 없거나 깨지면 기본 이미지 */
export default function FallbackImage({ src, alt = "", ...rest }) {
  const [failed, setFailed] = useState(false);
  return <img src={!src || failed ? NO_IMAGE : src} alt={alt} onError={() => setFailed(true)} {...rest} />;
}
