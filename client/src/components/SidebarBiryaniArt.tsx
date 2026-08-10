import { Box } from "@mui/material";

/**
 * The biryani handi that closes the navigation rail.
 *
 * Artwork resolution is a BUILD-TIME lookup, not a runtime fetch: drop a file
 * named `sidebar-biryani.<ext>` into src/assets and it is bundled, hashed and
 * used automatically. With no such file the glob returns an empty object and
 * the inline illustration below is drawn instead.
 *
 * That is why this is not simply an <img src="/sidebar-biryani.png"> with an
 * onError fallback: the rail renders on every page, so a missing file would
 * mean a 404 in the network log on every single navigation. This way the
 * absent case costs nothing and the present case needs no code change.
 */
const artwork = import.meta.glob<string>(
  "../assets/sidebar-biryani.{png,jpg,jpeg,webp,avif,svg}",
  { eager: true, query: "?url", import: "default" }
);
const ART_SRC: string | undefined = Object.values(artwork)[0];

/**
 * Stylised handi: copper body, gold rim and ring, saffron rice, mint garnish.
 * Drawn rather than photographed so it scales with the rail, needs no asset and
 * carries no colour that fights the green ground behind it.
 */
function BiryaniPotIllustration() {
  return (
    <Box
      component="svg"
      viewBox="0 0 200 210"
      role="presentation"
      aria-hidden
      sx={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id="bkPotBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#C86A2A" />
          <stop offset="55%" stopColor="#A64D18" />
          <stop offset="100%" stopColor="#75320E" />
        </linearGradient>
        <linearGradient id="bkPotRim" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#F0C948" />
          <stop offset="50%" stopColor="#D8A72F" />
          <stop offset="100%" stopColor="#B9861C" />
        </linearGradient>
        <linearGradient id="bkRice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#F5DE8C" />
          <stop offset="60%" stopColor="#E8B93A" />
          <stop offset="100%" stopColor="#D79B23" />
        </linearGradient>
        <radialGradient id="bkGlow" cx="50%" cy="58%" r="55%">
          <stop offset="0%" stopColor="#E9C767" stopOpacity="0.20" />
          <stop offset="100%" stopColor="#E9C767" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Warm bloom so the pot sits on the rail rather than being pasted onto it */}
      <ellipse cx="100" cy="130" rx="98" ry="78" fill="url(#bkGlow)" />

      {/* Decorative leaves scattered behind, as in the design */}
      <g fill="#3E7A34" opacity="0.5">
        <path d="M12 118c11-13 28-15 36-9-4 13-19 22-32 17z" />
        <path d="M188 132c-12-12-29-12-37-5 6 13 22 20 34 14z" />
        <path d="M22 178c13-7 27-1 32 8-10 8-27 8-35 1z" />
        <path d="M178 182c-13-6-27 0-31 9 10 8 26 7 34 0z" />
      </g>

      {/* Bucket handle. Drawn before the rice so the mound occludes its lower
          legs - that overlap is what makes it read as attached to the rim
          rather than floating above the pot. */}
      <path
        d="M26 124C26 60 56 34 100 34s74 26 74 90"
        fill="none" stroke="url(#bkPotRim)" strokeWidth="7" strokeLinecap="round"
      />
      <path
        d="M26 124C26 60 56 34 100 34s74 26 74 90"
        fill="none" stroke="#7E560F" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"
      />

      {/* Rice mound. Narrower than the handle's span on purpose - the gap either
          side is what keeps the legs visible, so the arc reads as a handle over
          the pot rather than a basket the rice sits inside. */}
      <path d="M46 124c4-30 26-52 54-52s50 22 54 52z" fill="url(#bkRice)" />
      {/* Individual grains catching the light */}
      <g fill="#FBF3D2" opacity="0.9">
        <ellipse cx="74" cy="104" rx="6.5" ry="2.8" transform="rotate(-26 74 104)" />
        <ellipse cx="100" cy="90" rx="7" ry="2.8" transform="rotate(10 100 90)" />
        <ellipse cx="128" cy="106" rx="6.5" ry="2.8" transform="rotate(-12 128 106)" />
        <ellipse cx="88" cy="116" rx="6" ry="2.6" transform="rotate(6 88 116)" />
        <ellipse cx="116" cy="117" rx="6" ry="2.6" transform="rotate(-8 116 117)" />
        <ellipse cx="60" cy="116" rx="5.5" ry="2.4" transform="rotate(-18 60 116)" />
      </g>
      {/* Whole spices */}
      <g>
        <circle cx="86" cy="101" r="3.4" fill="#B3341C" />
        <circle cx="120" cy="94" r="2.8" fill="#7C4A16" />
        <circle cx="104" cy="112" r="2.8" fill="#B3341C" opacity="0.85" />
        <circle cx="70" cy="108" r="2.2" fill="#7C4A16" opacity="0.8" />
      </g>
      {/* Mint garnish crowning the mound */}
      <g>
        <path d="M100 74c-10-8-11-22-3-29 9 6 13 21 3 29z" fill="#4E9A3F" />
        <path d="M108 78c10-8 23-6 28 2-8 8-23 9-28-2z" fill="#61B44C" />
        <path d="M93 80c-10-6-22-3-26 5 8 7 22 7 26-5z" fill="#3E8A33" />
      </g>

      {/* Rim */}
      <ellipse cx="100" cy="124" rx="72" ry="13" fill="url(#bkPotRim)" />
      <ellipse cx="100" cy="124" rx="72" ry="13" fill="none" stroke="#7E560F" strokeWidth="1.2" opacity="0.45" />

      {/* Body - wide belly tapering to a small foot, the handi silhouette */}
      <path
        d="M28 124c0 20 3 40 12 54 10 15 32 24 60 24s50-9 60-24c9-14 12-34 12-54z"
        fill="url(#bkPotBody)"
      />
      {/* Belly highlight */}
      <path d="M48 132c0 28 8 48 24 58-21-5-33-31-32-58z" fill="#E08A45" opacity="0.32" />
      {/* Engraved bands, which is what makes it read as a handi and not a bowl */}
      <path d="M32 150c20 10 116 10 136 0" fill="none" stroke="#F0C948" strokeWidth="2.8" opacity="0.42" />
      <path d="M42 174c17 9 99 9 116 0" fill="none" stroke="#F0C948" strokeWidth="2.2" opacity="0.28" />
      {/* Side lugs */}
      <path d="M26 136c-7 2-10 9-7 15" fill="none" stroke="url(#bkPotRim)" strokeWidth="5" strokeLinecap="round" />
      <path d="M174 136c7 2 10 9 7 15" fill="none" stroke="url(#bkPotRim)" strokeWidth="5" strokeLinecap="round" />
    </Box>
  );
}

type Props = {
  /** Rendered width. The rail passes its own width less the gutters. */
  width?: number | string;
};

export function SidebarBiryaniArt({ width = "100%" }: Props) {
  return (
    <Box
      aria-hidden
      sx={{
        width,
        mx: "auto",
        // Bleeds slightly past the rail's padding, as the design does, and is
        // clipped by the drawer's overflowX: hidden.
        mb: -1,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {ART_SRC ? (
        <Box
          component="img"
          src={ART_SRC}
          alt=""
          sx={{ width: "100%", height: "auto", display: "block", objectFit: "contain" }}
        />
      ) : (
        <BiryaniPotIllustration />
      )}
    </Box>
  );
}
