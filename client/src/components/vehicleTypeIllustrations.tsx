import type { ReactNode } from "react";

type SvgProps = { size: number; id: string };

function ArtShell({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function CarArt({ size }: SvgProps) {
  return (
    <ArtShell size={size}>
      <path d="M14 38h36l-4-11a5 5 0 0 0-4.7-3H25a5 5 0 0 0-4.5 2.8L14 38z" />
      <path d="M24 28h15l3 10H19l5-10z" />
      <path d="M13 38v8h38v-8" />
      <circle cx="22" cy="46" r="4" />
      <circle cx="42" cy="46" r="4" />
    </ArtShell>
  );
}

export function TruckArt({ size }: SvgProps) {
  return (
    <ArtShell size={size}>
      <path d="M10 25h30v20H10z" />
      <path d="M40 33h9l5 6v6H40V33z" />
      <path d="M44 36h5" />
      <path d="M15 45h34" />
      <circle cx="20" cy="48" r="4" />
      <circle cx="45" cy="48" r="4" />
    </ArtShell>
  );
}

export function BikeArt({ size }: SvgProps) {
  return (
    <ArtShell size={size}>
      <circle cx="20" cy="44" r="9" />
      <circle cx="45" cy="44" r="9" />
      <path d="M20 44l10-16 8 16H20z" />
      <path d="M30 28h10l5 16" />
      <path d="M34 24h8" />
      <path d="M42 24l4-5" />
    </ArtShell>
  );
}

export function MintruckArt({ size }: SvgProps) {
  return (
    <ArtShell size={size}>
      <path d="M12 31h27v14H12z" />
      <path d="M39 34h11l4 5v6H39V34z" />
      <path d="M16 26h19" />
      <path d="M18 26l-4 5" />
      <path d="M35 26l4 5" />
      <circle cx="20" cy="47" r="4" />
      <circle cx="45" cy="47" r="4" />
    </ArtShell>
  );
}

export function BusArt({ size }: SvgProps) {
  return (
    <ArtShell size={size}>
      <rect x="11" y="22" width="42" height="25" rx="4" />
      <path d="M16 29h32" />
      <path d="M18 34h6m6 0h6m6 0h6" />
      <path d="M17 47h30" />
      <circle cx="20" cy="50" r="4" />
      <circle cx="44" cy="50" r="4" />
    </ArtShell>
  );
}

export function AutoArt({ size }: SvgProps) {
  return (
    <ArtShell size={size}>
      <path d="M12 38h40v9H12z" />
      <path d="M23 38V25c8-3 19-3 29 0v13" />
      <path d="M13 38v-8h10l5 8" />
      <path d="M30 33h14" />
      <circle cx="18" cy="49" r="4" />
      <circle cx="41" cy="49" r="4" />
      <circle cx="50" cy="49" r="4" />
    </ArtShell>
  );
}

export function DefaultVehicleArt({ size }: SvgProps) {
  return (
    <ArtShell size={size}>
      <rect x="16" y="25" width="32" height="20" rx="4" />
      <path d="M20 34h24" />
      <circle cx="24" cy="47" r="4" />
      <circle cx="40" cy="47" r="4" />
    </ArtShell>
  );
}
