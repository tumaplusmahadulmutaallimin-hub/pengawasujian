interface MadrasahLogoProps {
  size?: number;
  className?: string;
}

export function MadrasahLogo({ size = 44, className = '' }: MadrasahLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Logo Madrasah SIPENGUJI"
    >
      {/* Institutional octagonal shield */}
      <path
        d="M32 3L52 11.5L60.5 32L52 52.5L32 61L12 52.5L3.5 32L12 11.5L32 3Z"
        fill="#065F46"
        stroke="#047857"
        strokeWidth="2"
      />
      <path
        d="M32 8L48.5 15L55.5 32L48.5 49L32 56L15.5 49L8.5 32L15.5 15L32 8Z"
        stroke="#A7F3D0"
        strokeOpacity="0.45"
        strokeWidth="1.25"
      />
      {/* Madrasah dome & open book motif */}
      <path
        d="M32 15C27.5 19.5 23 23.2 23 28.5V31H41V28.5C41 23.2 36.5 19.5 32 15Z"
        fill="#ECFDF5"
      />
      <circle cx="32" cy="12.5" r="1.7" fill="#FCD34D" />
      {/* Open book representing academic integrity */}
      <path
        d="M19 35.5C23.5 34 28.2 34.4 32 36.6C35.8 34.4 40.5 34 45 35.5V45.5C40.5 44.1 35.8 44.5 32 46.8C28.2 44.5 23.5 44.1 19 45.5V35.5Z"
        fill="#FFFFFF"
      />
      <path d="M32 36.6V46.8" stroke="#065F46" strokeWidth="1.5" />
    </svg>
  );
}
