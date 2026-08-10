import { SvgIcon, type SvgIconProps } from "@mui/material";

/**
 * The three flat glyphs in the mockup that MUI has no equivalent for.
 *
 * Everything else on this dashboard uses a stock @mui/icons-material icon
 * (GroupsRounded, HealthAndSafetyRounded, VideocamRounded and so on). These
 * three - the detective's fedora, the chef's toque and the standing figure that
 * marks loitering - only exist in the design as illustrations, so they are drawn
 * here rather than approximated with a stock icon that reads as a different
 * concept. Each inherits `color` and sizes off `fontSize`, exactly like a stock
 * icon, so callers treat them identically.
 */

/** Fedora + dark band, worn by the intruder-detection tiles. */
export function DetectiveHatIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      {/* Crown */}
      <path
        d="M7.8 10.2c-.35-2.2-.2-3.9.5-5.1.62-1.06 1.7-1.6 3.24-1.6 1.6 0 2.72.55 3.36 1.64.71 1.2.87 2.9.55 5.06H7.8z"
        fill="currentColor"
      />
      {/* Brim */}
      <path
        d="M3 13.1c0-1.02 1.6-1.9 4.3-2.35h9.4c2.7.45 4.3 1.33 4.3 2.35 0 1.6-4.03 2.6-9 2.6s-9-1-9-2.6z"
        fill="currentColor"
      />
      {/* Band, punched out of the crown so it reads as a separate ribbon */}
      <path d="M7.55 9.05h8.9v1.65h-8.9z" fill="currentColor" opacity="0.45" />
      {/* Collar/shoulders, which is what makes the glyph read as a person */}
      <path
        d="M5.4 20.8c.5-2.2 2.4-3.6 6.6-3.6s6.1 1.4 6.6 3.6z"
        fill="currentColor"
        opacity="0.75"
      />
    </SvgIcon>
  );
}

/** Chef's toque, used by the Chef / Non-Chef tiles. */
export function ChefHatIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      {/* Puffed crown - three overlapping lobes */}
      <path
        d="M12 2.6c1.86 0 3.42 1.03 4.18 2.5.3-.07.6-.1.92-.1 2.32 0 4.1 1.75 4.1 3.95 0 1.9-1.34 3.5-3.2 3.87v2.03H6v-2.03C4.14 12.45 2.8 10.85 2.8 8.95c0-2.2 1.78-3.95 4.1-3.95.32 0 .63.03.92.1C8.58 3.63 10.14 2.6 12 2.6z"
        fill="currentColor"
      />
      {/* Band */}
      <path
        d="M6 16.15h12v3.4c0 .82-.5 1.3-1.3 1.3H7.3c-.8 0-1.3-.48-1.3-1.3z"
        fill="currentColor"
        opacity="0.72"
      />
    </SvgIcon>
  );
}

/** Standing figure, used by the loitering tiles. */
export function StandingPersonIcon(props: SvgIconProps) {
  return (
    <SvgIcon viewBox="0 0 24 24" {...props}>
      <circle cx="12" cy="4.2" r="2.5" fill="currentColor" />
      {/* Torso with the arms held close to the body - a person waiting, not walking */}
      <path
        d="M9.9 7.5h4.2c1.1 0 1.95.85 1.95 1.95v5.1c0 .6-.47 1.05-1.07 1.05-.6 0-1.03-.45-1.03-1.05v-1.2h-.55v7.2c0 .68-.5 1.15-1.15 1.15-.66 0-1.12-.47-1.12-1.15v-4.3h-.5v4.3c0 .68-.46 1.15-1.12 1.15-.65 0-1.15-.47-1.15-1.15v-7.2h-.55v1.2c0 .6-.43 1.05-1.03 1.05-.6 0-1.07-.45-1.07-1.05v-5.1c0-1.1.85-1.95 1.95-1.95z"
        fill="currentColor"
      />
    </SvgIcon>
  );
}
