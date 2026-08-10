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
 * One flame, normalised: base at the origin, tip 48 units up, leaning slightly.
 *
 * Every flame in the drawing is this one path placed with a translate/scale, and
 * mirrored with a negative x-scale for the right-hand side. Hand-authoring each
 * flame as its own absolute path is what made the earlier attempt read as a row
 * of unrelated orange blobs - reusing one silhouette at different sizes is what
 * makes a fire look like a fire.
 */
const FLAME_OUTER = "M0 0C-15-11-13-31 0-48c5 13 13 18 11 31C10-7 6-3 0 0Z";
const FLAME_INNER = "M0 0C-9-7-8-19 0-30c3 8 8 11 7 19C6-4 4-2 0 0Z";

/**
 * A handi on a wood fire: stacked logs, flames licking round the base, copper
 * pot, saffron rice under mint, and dum steam rising off the top.
 *
 * Painting order matters and is not the order you would read the picture in.
 * Flames are split into a set drawn BEFORE the pot and a set drawn AFTER it, so
 * the fire wraps the pot instead of sitting flat behind or in front of it -
 * that overlap is what puts the pot inside the fire rather than on a poster of
 * one. Same reason the logs land between the two flame groups.
 */
function BiryaniPotIllustration() {
  return (
    <Box
      component="svg"
      viewBox="0 0 200 312"
      role="presentation"
      aria-hidden
      sx={{
        width: "100%",
        height: "auto",
        display: "block",
        "@keyframes bkFlicker": {
          "0%, 100%": { transform: "scaleY(1) scaleX(1)" },
          "35%": { transform: "scaleY(1.07) scaleX(0.97)" },
          "70%": { transform: "scaleY(0.96) scaleX(1.02)" },
        },
        "@keyframes bkSteam": {
          "0%": { opacity: 0, transform: "translateY(8px) scaleX(0.9)" },
          "30%": { opacity: 0.26 },
          "100%": { opacity: 0, transform: "translateY(-18px) scaleX(1.15)" },
        },
        "& .bk-flame": {
          transformBox: "fill-box",
          transformOrigin: "center bottom",
          animation: "bkFlicker 2.6s ease-in-out infinite",
        },
        "& .bk-flame-inner": { animationDuration: "1.9s", animationDelay: "-0.6s" },
        "& .bk-steam > path": {
          transformBox: "fill-box",
          transformOrigin: "center bottom",
          animation: "bkSteam 7s ease-in-out infinite",
        },
        "& .bk-steam > path:nth-of-type(2)": { animationDelay: "-2.3s" },
        "& .bk-steam > path:nth-of-type(3)": { animationDelay: "-4.6s" },
        // The console already ships a global reduced-motion block, but this is
        // decoration on every page, so it opts out explicitly and settles at a
        // visible resting opacity rather than mid-fade.
        "@media (prefers-reduced-motion: reduce)": {
          "& .bk-flame, & .bk-steam > path": { animation: "none" },
          "& .bk-steam > path": { opacity: 0.2 },
        },
      }}
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
        <linearGradient id="bkFlameOuter" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#D8371A" />
          <stop offset="45%" stopColor="#F0731A" />
          <stop offset="100%" stopColor="#F7A825" />
        </linearGradient>
        <linearGradient id="bkFlameInner" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#F9A825" />
          <stop offset="60%" stopColor="#FFD34E" />
          <stop offset="100%" stopColor="#FFF0B4" />
        </linearGradient>
        <linearGradient id="bkLog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8A5A2E" />
          <stop offset="100%" stopColor="#5B3618" />
        </linearGradient>
        {/* Firelight, warm and low - the pot is lit from underneath */}
        <radialGradient id="bkFireGlow" cx="50%" cy="82%" r="52%">
          <stop offset="0%" stopColor="#FF9A2E" stopOpacity="0.34" />
          <stop offset="60%" stopColor="#E8541F" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#E8541F" stopOpacity="0" />
        </radialGradient>
      </defs>

      <ellipse cx="100" cy="248" rx="99" ry="66" fill="url(#bkFireGlow)" />

      {/* Dum steam off the rice */}
      <g className="bk-steam" fill="none" stroke="#EAF1E4" strokeLinecap="round">
        <path d="M78 74c-7-12 5-19-2-31 -5-9 3-15 0-22" strokeWidth="5" opacity="0.20" />
        <path d="M100 66c-8-13 6-21-2-34 -6-10 4-16 1-24" strokeWidth="6" opacity="0.24" />
        <path d="M124 76c-7-12 5-19-2-31 -5-9 3-14 0-21" strokeWidth="5" opacity="0.18" />
      </g>

      {/* Bucket handle. Drawn before the rice so the mound occludes its lower
          legs - that overlap is what makes it read as attached to the rim. */}
      <path
        d="M28 150C28 92 58 68 100 68s72 24 72 82"
        fill="none" stroke="url(#bkPotRim)" strokeWidth="7" strokeLinecap="round"
      />
      <path
        d="M28 150C28 92 58 68 100 68s72 24 72 82"
        fill="none" stroke="#7E560F" strokeWidth="1.2" strokeLinecap="round" opacity="0.45"
      />

      {/* Rice mound. Narrower than the handle's span on purpose - the gap either
          side keeps the legs visible, so the arc reads as a handle over the pot
          rather than a basket the rice sits inside. */}
      <path d="M46 150c4-30 26-52 54-52s50 22 54 52z" fill="url(#bkRice)" />
      <g fill="#FBF3D2" opacity="0.9">
        <ellipse cx="74" cy="130" rx="6.5" ry="2.8" transform="rotate(-26 74 130)" />
        <ellipse cx="100" cy="116" rx="7" ry="2.8" transform="rotate(10 100 116)" />
        <ellipse cx="128" cy="132" rx="6.5" ry="2.8" transform="rotate(-12 128 132)" />
        <ellipse cx="88" cy="142" rx="6" ry="2.6" transform="rotate(6 88 142)" />
        <ellipse cx="116" cy="143" rx="6" ry="2.6" transform="rotate(-8 116 143)" />
        <ellipse cx="60" cy="142" rx="5.5" ry="2.4" transform="rotate(-18 60 142)" />
      </g>
      <g>
        <circle cx="86" cy="127" r="3.4" fill="#B3341C" />
        <circle cx="120" cy="120" r="2.8" fill="#7C4A16" />
        <circle cx="104" cy="138" r="2.8" fill="#B3341C" opacity="0.85" />
        <circle cx="70" cy="134" r="2.2" fill="#7C4A16" opacity="0.8" />
      </g>
      {/* Mint garnish crowning the mound */}
      <g>
        <path d="M100 100c-10-8-11-22-3-29 9 6 13 21 3 29z" fill="#4E9A3F" />
        <path d="M108 104c10-8 23-6 28 2-8 8-23 9-28-2z" fill="#61B44C" />
        <path d="M93 106c-10-6-22-3-26 5 8 7 22 7 26-5z" fill="#3E8A33" />
      </g>

      {/* Rim */}
      <ellipse cx="100" cy="150" rx="72" ry="13" fill="url(#bkPotRim)" />
      <ellipse cx="100" cy="150" rx="72" ry="13" fill="none" stroke="#7E560F" strokeWidth="1.2" opacity="0.45" />

      {/* Flames BEHIND the pot, spreading wider than it so the fire is not just
          a shape parked in front of the picture */}
      <g className="bk-flame">
        <g transform="translate(28 256) scale(0.85)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.9" /></g>
        <g transform="translate(172 256) scale(-0.85 0.85)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.9" /></g>
        <g transform="translate(46 262) scale(0.62)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.75" /></g>
        <g transform="translate(154 262) scale(-0.62 0.62)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.75" /></g>
      </g>

      {/* Pot body - wide belly tapering to a small foot, the handi silhouette */}
      <path
        d="M28 150c0 22 3 44 12 60 10 16 32 26 60 26s50-10 60-26c9-16 12-38 12-60z"
        fill="url(#bkPotBody)"
      />
      <path d="M48 158c0 31 8 53 24 64-21-6-33-34-32-64z" fill="#E08A45" opacity="0.32" />
      {/* Engraved bands, which is what makes it read as a handi and not a bowl */}
      <path d="M32 178c20 10 116 10 136 0" fill="none" stroke="#F0C948" strokeWidth="2.8" opacity="0.42" />
      <path d="M42 204c17 9 99 9 116 0" fill="none" stroke="#F0C948" strokeWidth="2.2" opacity="0.28" />
      {/* Underside catching the firelight, which is what seats it on the flames */}
      <path d="M52 224c12 10 30 14 48 14s36-4 48-14c-10 14-28 22-48 22s-38-8-48-22z" fill="#FF9A2E" opacity="0.35" />
      {/* Side lugs */}
      <path d="M26 162c-7 2-10 9-7 15" fill="none" stroke="url(#bkPotRim)" strokeWidth="5" strokeLinecap="round" />
      <path d="M174 162c7 2 10 9 7 15" fill="none" stroke="url(#bkPotRim)" strokeWidth="5" strokeLinecap="round" />

      {/* Firewood, stacked and crossed under the pot */}
      <g>
        <g transform="rotate(-7 100 276)">
          <rect x="24" y="266" width="152" height="20" rx="10" fill="url(#bkLog)" />
          <ellipse cx="24" cy="276" rx="6.5" ry="10" fill="#A9743C" />
          <ellipse cx="24" cy="276" rx="3.2" ry="5.2" fill="#6B4423" />
          <path d="M46 272h100M58 281h84" stroke="#3F2410" strokeWidth="1.6" opacity="0.38" strokeLinecap="round" />
        </g>
        <g transform="rotate(6 100 292)">
          <rect x="34" y="284" width="134" height="18" rx="9" fill="url(#bkLog)" />
          <ellipse cx="168" cy="293" rx="6" ry="9" fill="#A9743C" />
          <ellipse cx="168" cy="293" rx="3" ry="4.6" fill="#6B4423" />
          <path d="M54 291h94" stroke="#3F2410" strokeWidth="1.5" opacity="0.38" strokeLinecap="round" />
        </g>
        {/* Embers glowing in the gap between the logs */}
        <g fill="#FF7A1A">
          <circle cx="74" cy="284" r="2.8" opacity="0.95" />
          <circle cx="110" cy="282" r="2.3" opacity="0.85" />
          <circle cx="140" cy="287" r="1.9" opacity="0.8" />
        </g>
      </g>

      {/* Flames IN FRONT, rising off the logs and over the pot's foot. Drawn
          after the logs so the fire reads as burning ON the wood. */}
      <g className="bk-flame">
        <g transform="translate(100 276) scale(1.22)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" /></g>
        <g transform="translate(70 280) scale(0.92)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.96" /></g>
        <g transform="translate(130 280) scale(-0.92 0.92)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.96" /></g>
        <g transform="translate(50 284) scale(0.6)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.85" /></g>
        <g transform="translate(150 284) scale(-0.6 0.6)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.85" /></g>
      </g>
      <g className="bk-flame bk-flame-inner">
        <g transform="translate(100 276) scale(0.7)"><path d={FLAME_INNER} fill="url(#bkFlameInner)" /></g>
        <g transform="translate(70 280) scale(0.55)"><path d={FLAME_INNER} fill="url(#bkFlameInner)" opacity="0.92" /></g>
        <g transform="translate(130 280) scale(-0.55 0.55)"><path d={FLAME_INNER} fill="url(#bkFlameInner)" opacity="0.92" /></g>
      </g>

      {/* Sparks drifting off the fire */}
      <g fill="#FFC24E">
        <circle cx="46" cy="228" r="1.8" opacity="0.75" />
        <circle cx="158" cy="216" r="1.5" opacity="0.6" />
        <circle cx="36" cy="200" r="1.2" opacity="0.5" />
        <circle cx="166" cy="242" r="1.4" opacity="0.55" />
      </g>
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
        // No negative bleed: the firewood sits on the bottom edge of the
        // viewBox, so pulling the block down clips the logs in half.
        mb: 0,
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
