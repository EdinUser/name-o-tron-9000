export type IconProps = { className?: string };

export function IconBolt({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M13 2 4 14h6l-1 8 11-14h-6l1-6z" />
    </svg>
  );
}

export function IconRefresh({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 4a8 8 0 1 0 7.45 10h-2.14a6 6 0 1 1-1.31-5.94L14 10h6V4l-2.07 2.07A9.97 9.97 0 0 0 12 4z" />
    </svg>
  );
}

export function IconLogin({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M10 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-8v-2h8V5h-8V3z" />
      <path d="M3 12l6-5v3h6v4H9v3l-6-5z" />
    </svg>
  );
}

export function IconSettings({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0-6l2 2 3-1 1 3 3 1-1 3 2 2-2 2 1 3-3 1-1 3-3-1-2 2-2-2-3 1-1-3-3-1 1-3-2-2 2-2-1-3 3-1 1-3 3 1 2-2z" />
    </svg>
  );
}

export function IconServer({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3H3V5zm0 5h18v4H3v-4zm0 6h18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3z" />
    </svg>
  );
}

export function IconArrowForward({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M4 11h10l-3.5-3.5L12 6l6 6-6 6-1.5-1.5L14 13H4v-2z" />
    </svg>
  );
}

export function IconArrowBack({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20 11H10l3.5-3.5L12 6 6 12l6 6 1.5-1.5L10 13h10v-2z" />
    </svg>
  );
}

export function IconOpenInNew({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M5 5h8v2H7v10h10v-6h2v8H5V5z" />
      <path d="M13 5h6v6h-2V8.41l-7.29 7.3-1.42-1.42L15.59 7H13V5z" />
    </svg>
  );
}

export function IconSelectOff({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M3 5h14v10H7l-4 4V5zm4 2v6h8V7H7zm12-1h2v12h-8v-2h6V6z" />
      <path d="M8 9h6v2H8z" />
    </svg>
  );
}
