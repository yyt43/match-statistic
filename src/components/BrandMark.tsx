import { useId } from 'react';

interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = 'w-14 h-14' }: BrandMarkProps) {
  const id = useId().replace(/:/g, '');
  const backgroundId = `${id}-background`;
  const goldId = `${id}-gold`;
  const emeraldId = `${id}-emerald`;

  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={backgroundId} x1="8" y1="4" x2="57" y2="61" gradientUnits="userSpaceOnUse">
          <stop stopColor="#312E81" />
          <stop offset="0.58" stopColor="#111827" />
          <stop offset="1" stopColor="#0F172A" />
        </linearGradient>
        <linearGradient id={goldId} x1="21" y1="14" x2="45" y2="47" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FEF3C7" />
          <stop offset="0.42" stopColor="#FACC15" />
          <stop offset="1" stopColor="#D97706" />
        </linearGradient>
        <linearGradient id={emeraldId} x1="12" y1="44" x2="52" y2="53" gradientUnits="userSpaceOnUse">
          <stop stopColor="#6EE7B7" />
          <stop offset="1" stopColor="#10B981" />
        </linearGradient>
      </defs>

      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${backgroundId})`} />
      <rect x="3" y="3" width="58" height="58" rx="15" stroke="#A5B4FC" strokeOpacity="0.3" strokeWidth="2" />

      <path
        d="M18.5 18.5H45.5V29C45.5 36.456 39.456 42.5 32 42.5C24.544 42.5 18.5 36.456 18.5 29V18.5Z"
        fill={`url(#${goldId})`}
      />
      <path
        d="M18.5 22H14.5C12.567 22 11 23.567 11 25.5V27C11 32.523 15.477 37 21 37"
        stroke="#FBBF24"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M45.5 22H49.5C51.433 22 53 23.567 53 25.5V27C53 32.523 48.523 37 43 37"
        stroke="#FBBF24"
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      <path d="M29 42H35V47H29V42Z" fill="#D97706" />
      <path d="M24.5 47H39.5C41.433 47 43 48.567 43 50.5V52H21V50.5C21 48.567 22.567 47 24.5 47Z" fill={`url(#${goldId})`} />
      <path d="M20 52H44" stroke="#FDE68A" strokeWidth="2.4" strokeLinecap="round" />

      <path
        d="M32 8.5L33.7 12.7L38 14.5L33.7 16.3L32 20.5L30.3 16.3L26 14.5L30.3 12.7L32 8.5Z"
        fill="#F8FAFC"
      />
      <circle cx="13.5" cy="47.5" r="3.5" fill={`url(#${emeraldId})`} />
      <circle cx="50.5" cy="47.5" r="3.5" fill={`url(#${emeraldId})`} />
      <path d="M16.5 45.5L23 40.5" stroke="#34D399" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M47.5 45.5L41 40.5" stroke="#34D399" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
