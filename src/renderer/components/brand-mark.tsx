import iconUrl from "../assets/luna-icon.svg";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <img src={iconUrl} alt="" width={36} height={36} />
    </span>
  );
}
