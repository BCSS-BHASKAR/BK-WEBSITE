import { Box } from "@mui/material";

/**
 * Backdrop behind the sign-in card.
 *
 * This used to layer two photographs, `LoginHero.jpg` and `LoginFlag.png`. Both
 * were screenshots of the previous product's login page — Philippine flag,
 * "Philippine National Police Operations Console", a name@pnp.gov.ph field — so
 * the old form showed through as a ghost card behind the real one. They are
 * replaced with a painted gradient in the venue palette: nothing to load, and
 * nothing that belongs to another brand.
 *
 * The image files are still in `public/` and can be deleted.
 */
export function LoginHeroBackdrop() {
  return (
    <>
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          background: `
            radial-gradient(ellipse 80% 60% at 78% 12%, rgba(217, 174, 69, 0.20) 0%, transparent 55%),
            radial-gradient(ellipse 65% 50% at 15% 90%, rgba(126, 63, 91, 0.28) 0%, transparent 55%),
            linear-gradient(155deg, #2C3D1B 0%, #243117 48%, #141B0C 100%)
          `,
        }}
      />
      {/* Soft vignette so the sign-in card keeps its edge against the panel. */}
      <Box
        aria-hidden
        sx={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 75% 65% at 50% 45%, transparent 0%, rgba(12, 2, 6, 0.55) 100%)",
          pointerEvents: "none",
        }}
      />
    </>
  );
}
