import { memo } from "react";
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

// ---------------------------------------------------------------------------
// Rice
//
// The mound is built from ~430 individual grains rather than a filled dome with
// a few highlight strokes on it. That is the whole difference between "yellow
// hill" and "biryani": real rice reads as separate long grains in mixed colours
// - plain white basmati next to saffron-stained and masala-stained ones - and no
// amount of shading on a solid shape reproduces that.
//
// Positions come from a SEEDED generator, evaluated once at module load. Seeded
// so the drawing is identical on every render and every build (an unseeded
// Math.random would reshuffle the rice on each re-render); once at module load
// because the mound never changes, so there is nothing to recompute per paint.
// ---------------------------------------------------------------------------

/** mulberry32 - small, fast, and good enough for scattering rice. */
function seededRandom(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cumulative weights: mostly plain basmati, a scatter of saffron and masala. */
const GRAIN_TONES: { fill: string; weight: number }[] = [
  { fill: "#F7F2E4", weight: 26 }, // plain basmati, catching light
  { fill: "#EFE6CF", weight: 22 }, // plain, in shade
  { fill: "#F2D98C", weight: 15 }, // faint saffron bleed
  { fill: "#E9BE55", weight: 14 }, // saffron
  { fill: "#DC9A33", weight: 11 }, // deep saffron
  { fill: "#C6741F", weight: 7 },  // masala-stained
  { fill: "#9C5518", weight: 5 },  // browned at the edges
];
const TONE_TOTAL = GRAIN_TONES.reduce((a, t) => a + t.weight, 0);

type Grain = { x: number; y: number; rx: number; ry: number; rot: number; fill: string };

/** Mound geometry, shared by the generator and the clip path. */
const MOUND = { cx: 100, base: 150, rx: 56, ry: 54 };

function buildGrains(count: number): Grain[] {
  const rnd = seededRandom(20260810);
  const grains: Grain[] = [];
  let guard = 0;
  while (grains.length < count && guard < count * 40) {
    guard += 1;
    const x = MOUND.cx - MOUND.rx - 4 + rnd() * (MOUND.rx * 2 + 8);
    const y = MOUND.base - MOUND.ry - 4 + rnd() * (MOUND.ry + 4);
    const nx = (x - MOUND.cx) / MOUND.rx;
    const ny = (MOUND.base - y) / MOUND.ry;
    // Rejection-sample the semi-ellipse, allowing a little OVERSHOOT past the
    // boundary. Those stray grains are the point: the heap is clipped only at
    // the rim line, so its domed edge is formed by the grains themselves and
    // comes out irregular, the way tipped-out rice actually sits. Clipping to a
    // smooth dome gave it a cut-with-a-compass silhouette.
    const r2 = nx * nx + ny * ny;
    if (r2 > 1.07) continue;
    // Thin the overshoot band so the edge frays rather than forming a rind.
    if (r2 > 0.9 && rnd() > 0.55) continue;

    let pick = rnd() * TONE_TOTAL;
    let fill = GRAIN_TONES[0].fill;
    for (const tone of GRAIN_TONES) {
      pick -= tone.weight;
      if (pick <= 0) { fill = tone.fill; break; }
    }
    grains.push({
      x,
      y,
      rx: 2.7 + rnd() * 1.7,
      ry: 1.0 + rnd() * 0.45,
      // Grains lie every which way, but flatter near the base where the heap
      // settles, so the rotation range narrows lower down.
      rot: (rnd() - 0.5) * (120 + ny * 120),
      fill,
    });
  }
  // Painter's order: back-to-front, so lower grains are overlapped by the ones
  // in front of them and the heap gains depth.
  return grains.sort((a, b) => a.y - b.y);
}

const RICE_GRAINS = buildGrains(430);

/**
 * One flame, normalised: base at the origin, tip 48 units up, leaning slightly.
 *
 * Every flame in the drawing is this one path placed with a translate/scale, and
 * mirrored with a negative x-scale for the right-hand side. Hand-authoring each
 * flame as its own absolute path is what made an earlier attempt read as a row
 * of unrelated orange blobs - reusing one silhouette at different sizes is what
 * makes a fire look like a fire.
 */
const FLAME_OUTER = "M0 0C-15-11-13-31 0-48c5 13 13 18 11 31C10-7 6-3 0 0Z";
const FLAME_MID = "M0 0C-11-8-10-23 0-36c4 10 9 13 8 23C7-5 4-2 0 0Z";
const FLAME_INNER = "M0 0C-7-5-6-15 0-24c2 7 6 9 5 15C4-3 3-1 0 0Z";

/** A mint leaf with a midrib, drawn once and placed by transform. */
function MintLeaf({ transform, tone = "#4E9A3F" }: { transform: string; tone?: string }) {
  return (
    <g transform={transform}>
      <path d="M0 0C-13-4-19-15-16-25-5-24 3-15 0 0Z" fill={tone} />
      <path d="M0 0C-9-4-14-13-15-22" fill="none" stroke="#2F6B27" strokeWidth="0.9" opacity="0.7" />
      <path d="M-4-7l-5-2M-7-13l-5-2M-10-18l-4-2" stroke="#2F6B27" strokeWidth="0.7" opacity="0.5" />
    </g>
  );
}

/**
 * A handi on a wood fire: firewood, flames wrapping the pot, hammered copper,
 * a heaped bed of individually drawn rice under mint, fried onion and whole
 * spices, and dum steam rising off it.
 *
 * Painting order matters and is not the order you would read the picture in.
 * Flames are split into a set drawn BEFORE the pot and a set drawn AFTER it, so
 * the fire wraps the pot instead of sitting flat behind or in front of it, and
 * the logs land between the two groups so the fire burns ON the wood.
 *
 * memo'd because it takes no props and the heap alone is 400-odd nodes: the rail
 * is mounted on every route, so without this each navigation would reconcile the
 * whole drawing to produce exactly the same output.
 */
const BiryaniPotIllustration = memo(function BiryaniPotIllustration() {
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
          "70%": { transform: "scaleY(0.95) scaleX(1.03)" },
        },
        "@keyframes bkSteam": {
          "0%": { opacity: 0, transform: "translateY(10px) scaleX(0.85)" },
          "30%": { opacity: 0.3 },
          "100%": { opacity: 0, transform: "translateY(-20px) scaleX(1.2)" },
        },
        "& .bk-flame": {
          transformBox: "fill-box",
          transformOrigin: "center bottom",
          animation: "bkFlicker 2.6s ease-in-out infinite",
        },
        "& .bk-flame-mid": { animationDuration: "2.1s", animationDelay: "-0.4s" },
        "& .bk-flame-inner": { animationDuration: "1.7s", animationDelay: "-0.9s" },
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
          "& .bk-steam > path": { opacity: 0.22 },
        },
      }}
    >
      <defs>
        {/* Cylindrical shading: dark at both edges, lit left of centre. A single
            two-stop gradient reads as a flat disc, not a round pot. */}
        <linearGradient id="bkPotBody" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#5A2508" />
          <stop offset="10%" stopColor="#8E3F10" />
          <stop offset="30%" stopColor="#CE7A2E" />
          <stop offset="44%" stopColor="#D98C3D" />
          <stop offset="62%" stopColor="#B25A1B" />
          <stop offset="84%" stopColor="#80350D" />
          <stop offset="100%" stopColor="#551F06" />
        </linearGradient>
        {/* Contact shadow where the belly turns under */}
        <linearGradient id="bkPotFloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0" />
          <stop offset="70%" stopColor="#2A0F02" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#1A0900" stopOpacity="0.55" />
        </linearGradient>
        <linearGradient id="bkBrass" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#8A6210" />
          <stop offset="18%" stopColor="#E5C05A" />
          <stop offset="38%" stopColor="#FBEBA8" />
          <stop offset="58%" stopColor="#D8A72F" />
          <stop offset="80%" stopColor="#9C7016" />
          <stop offset="100%" stopColor="#6E4A0B" />
        </linearGradient>
        <linearGradient id="bkLog" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9A6836" />
          <stop offset="45%" stopColor="#7A4A24" />
          <stop offset="100%" stopColor="#4A2A11" />
        </linearGradient>
        <radialGradient id="bkLogEnd" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#C79A5E" />
          <stop offset="70%" stopColor="#A9743C" />
          <stop offset="100%" stopColor="#7A4A24" />
        </radialGradient>
        <linearGradient id="bkFlameOuter" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#C42B12" />
          <stop offset="40%" stopColor="#EE6A16" />
          <stop offset="100%" stopColor="#F7A825" />
        </linearGradient>
        <linearGradient id="bkFlameMid" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#F2801A" />
          <stop offset="60%" stopColor="#FBC02D" />
          <stop offset="100%" stopColor="#FFE082" />
        </linearGradient>
        <linearGradient id="bkFlameInner" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#FFD34E" />
          <stop offset="70%" stopColor="#FFF3C4" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
        {/* Warm firelight, low in the scene - the pot is lit from underneath */}
        <radialGradient id="bkFireGlow" cx="50%" cy="84%" r="52%">
          <stop offset="0%" stopColor="#FFA435" stopOpacity="0.40" />
          <stop offset="55%" stopColor="#E8541F" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#E8541F" stopOpacity="0" />
        </radialGradient>
        {/* Shade at the foot of the mound, so the rice sits IN the pot */}
        <radialGradient id="bkRiceShade" cx="42%" cy="26%" r="78%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.22" />
          <stop offset="55%" stopColor="#000000" stopOpacity="0" />
          <stop offset="100%" stopColor="#5A3208" stopOpacity="0.45" />
        </radialGradient>

        <filter id="bkGlowBlur" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5.5" />
        </filter>
        <filter id="bkSmokeBlur" x="-80%" y="-40%" width="260%" height="200%">
          <feGaussianBlur stdDeviation="3.2" />
        </filter>

        {/* Cut at the rim line only. The dome is drawn by the grains, not by
            this clip - see buildGrains. */}
        <clipPath id="bkMoundClip">
          <rect x="26" y="84" width="148" height="66" />
        </clipPath>
      </defs>

      <ellipse cx="100" cy="252" rx="99" ry="68" fill="url(#bkFireGlow)" />

      {/* Dum steam. Blurred rather than stroked hard - sharp-edged smoke is the
          giveaway that a drawing is a drawing. */}
      <g className="bk-steam" fill="none" stroke="#EAF1E4" strokeLinecap="round" filter="url(#bkSmokeBlur)">
        <path d="M76 78c-8-13 5-20-3-33-5-9 3-15 0-23" strokeWidth="5" opacity="0.22" />
        <path d="M100 68c-9-14 6-22-2-36-6-10 4-17 1-26" strokeWidth="6.5" opacity="0.26" />
        <path d="M126 80c-8-12 5-19-2-32-5-9 3-14 0-22" strokeWidth="4.5" opacity="0.2" />
      </g>

      {/* Bail handle, behind the rice so the mound occludes its lower legs -
          that overlap is what attaches it to the rim. */}
      <path
        d="M30 152C30 96 58 72 100 72s70 24 70 80"
        fill="none" stroke="url(#bkBrass)" strokeWidth="6" strokeLinecap="round"
      />
      <path
        d="M34 150C34 100 60 78 100 78"
        fill="none" stroke="#FFF0BC" strokeWidth="1.6" strokeLinecap="round" opacity="0.55"
      />

      {/* ---- Rice ---- */}
      {/* Bed under the grains, inset so they overhang it. Warm mid-tone, not
          dark brown: the gaps between grains should read as shadow between
          grains, and too dark a bed turns the whole heap muddy. */}
      <path d="M47 150c0-28 24-51 53-51s53 23 53 51z" fill="#C08A32" />
      <g clipPath="url(#bkMoundClip)">
        {RICE_GRAINS.map((g, i) => (
          <ellipse
            key={i}
            cx={g.x}
            cy={g.y}
            rx={g.rx}
            ry={g.ry}
            fill={g.fill}
            transform={`rotate(${g.rot.toFixed(1)} ${g.x.toFixed(1)} ${g.y.toFixed(1)})`}
          />
        ))}
        {/* Saffron soak - a couple of stained patches, as a real dum pot has */}
        <g fill="#D9820F" opacity="0.22" style={{ mixBlendMode: "multiply" }}>
          <ellipse cx="76" cy="126" rx="18" ry="12" transform="rotate(-18 76 126)" />
          <ellipse cx="126" cy="137" rx="15" ry="9" transform="rotate(12 126 137)" />
        </g>
        {/* Form shading over the whole heap */}
        <path d="M40 150c0-32 27-56 60-56s60 24 60 56z" fill="url(#bkRiceShade)" />
      </g>

      {/* Fried onion (birista) strands scattered over the top */}
      <g fill="none" stroke="#8E4A12" strokeLinecap="round" opacity="0.85">
        <path d="M70 120c5-4 11-3 14 1" strokeWidth="2.4" />
        <path d="M112 112c5-3 10-1 12 3" strokeWidth="2.2" />
        <path d="M92 134c6-2 11 1 13 5" strokeWidth="2.4" />
        <path d="M126 124c4-3 9-2 11 2" strokeWidth="2" />
      </g>
      <g fill="none" stroke="#C97A26" strokeLinecap="round" opacity="0.8">
        <path d="M71 119c4-3 9-2 12 1" strokeWidth="1.2" />
        <path d="M93 133c5-2 9 1 11 4" strokeWidth="1.2" />
      </g>

      {/* Whole spices: cinnamon quill, star anise, cardamom, cloves.
          Each gets a soft shadow first - without one they sink into the grain
          noise and read as discoloured rice rather than as objects on top. */}
      <g fill="#3A2205" opacity="0.25">
        <ellipse cx="64" cy="142" rx="12" ry="4" transform="rotate(-16 64 142)" />
        <ellipse cx="137" cy="121" rx="9" ry="3.4" />
        <ellipse cx="87" cy="114" rx="5" ry="2.2" />
        <ellipse cx="111" cy="144" rx="4.4" ry="2" />
      </g>
      <g>
        {/* Cinnamon */}
        <g transform="rotate(-16 62 138)">
          <rect x="52" y="134" width="21" height="7" rx="3.5" fill="#8A5220" />
          <path d="M56 134v7M61 134v7M66 134v7" stroke="#5E3413" strokeWidth="0.8" opacity="0.7" />
          <ellipse cx="52" cy="137.5" rx="2" ry="3.5" fill="#B07A3E" />
        </g>
        {/* Star anise */}
        <g transform="translate(136 118) rotate(14)">
          <g fill="#6B3A14">
            <ellipse rx="7.5" ry="2.4" />
            <ellipse rx="7.5" ry="2.4" transform="rotate(45)" />
            <ellipse rx="7.5" ry="2.4" transform="rotate(90)" />
            <ellipse rx="7.5" ry="2.4" transform="rotate(135)" />
          </g>
          <circle r="2.1" fill="#A8702F" />
        </g>
        {/* Cardamom pods */}
        <ellipse cx="86" cy="112" rx="4.2" ry="2.8" fill="#A8C46A" transform="rotate(-22 86 112)" />
        <path d="M83 111c2-2 5-2 6 0" stroke="#7C9A45" strokeWidth="0.8" fill="none" />
        <ellipse cx="110" cy="142" rx="3.8" ry="2.5" fill="#9FBC5F" transform="rotate(16 110 142)" />
        {/* Cloves */}
        <g fill="#4E2A0E">
          <circle cx="102" cy="120" r="1.9" />
          <rect x="101.2" y="120" width="1.6" height="5" rx="0.8" />
          <circle cx="66" cy="128" r="1.7" />
          <rect x="65.3" y="128" width="1.4" height="4.4" rx="0.7" />
        </g>
      </g>

      {/* Mint and coriander lying ON the heap, not hovering over its peak.
          Each sits a little down the slope with a contact shadow under it. */}
      <g fill="#3A2205" opacity="0.22">
        <ellipse cx="92" cy="112" rx="9" ry="3.2" transform="rotate(-12 92 112)" />
        <ellipse cx="118" cy="122" rx="7" ry="2.6" transform="rotate(16 118 122)" />
        <ellipse cx="74" cy="132" rx="6" ry="2.4" transform="rotate(-22 74 132)" />
      </g>
      <MintLeaf transform="translate(99 110) rotate(24) scale(0.82)" />
      <MintLeaf transform="translate(124 124) rotate(-52) scale(0.66)" tone="#61B44C" />
      <MintLeaf transform="translate(80 134) rotate(96) scale(0.6)" tone="#3E8A33" />
      <MintLeaf transform="translate(112 104) rotate(-14) scale(0.54)" tone="#57A643" />

      {/* ---- Pot ---- */}
      {/* Rim: outer brass band, then a darker inner ellipse for wall thickness */}
      <ellipse cx="100" cy="150" rx="72" ry="13.5" fill="url(#bkBrass)" />
      {/* Wall thickness: a thin inner shadow, not a filled disc - a heavy one
          reads as a lid and hides the foot of the rice. */}
      <ellipse cx="100" cy="149" rx="65" ry="9.5" fill="none" stroke="#6B3E0C" strokeWidth="2.4" opacity="0.4" />
      <ellipse cx="100" cy="150" rx="72" ry="13.5" fill="none" stroke="#6E4A0B" strokeWidth="1" opacity="0.5" />

      <path
        d="M28 150c0 22 3 44 12 60 10 16 32 26 60 26s50-10 60-26c9-16 12-38 12-60z"
        fill="url(#bkPotBody)"
      />
      {/* Specular streak - a hard-edged highlight is what makes metal read as
          metal rather than as painted clay */}
      <path d="M50 160c-1 28 5 50 17 63-13-7-22-23-25-42-2-9-1-16 0-21z" fill="#FFD9A0" opacity="0.17" />
      <path d="M45 160c0 26 4 46 13 59-11-8-18-26-19-46-1-6 1-10 6-13z" fill="#FFF1D6" opacity="0.13" />
      {/* Hammered dimples along the belly */}
      <g fill="#3F1A05" opacity="0.14">
        <ellipse cx="82" cy="196" rx="7" ry="4" />
        <ellipse cx="104" cy="204" rx="8" ry="4.4" />
        <ellipse cx="126" cy="192" rx="6.5" ry="3.8" />
        <ellipse cx="66" cy="182" rx="5.5" ry="3.4" />
        <ellipse cx="140" cy="178" rx="5" ry="3" />
      </g>
      {/* Engraved bands, which is what makes it read as a handi and not a bowl */}
      <path d="M32 178c20 10 116 10 136 0" fill="none" stroke="#F0C948" strokeWidth="2.6" opacity="0.40" />
      <path d="M32 181c20 10 116 10 136 0" fill="none" stroke="#4A1E05" strokeWidth="1.2" opacity="0.35" />
      <path d="M42 204c17 9 99 9 116 0" fill="none" stroke="#F0C948" strokeWidth="2" opacity="0.26" />
      {/* Turn-under shadow */}
      <path
        d="M28 150c0 22 3 44 12 60 10 16 32 26 60 26s50-10 60-26c9-16 12-38 12-60z"
        fill="url(#bkPotFloor)"
      />
      {/* Firelight on the underside, which is what seats the pot on the flames */}
      <path d="M50 222c12 12 31 17 50 17s38-5 50-17c-10 16-29 25-50 25s-40-9-50-25z" fill="#FF9A2E" opacity="0.42" />
      {/* Soot */}
      <path d="M62 232c10 8 24 12 38 12s28-4 38-12c-9 12-23 18-38 18s-29-6-38-18z" fill="#241205" opacity="0.35" />
      {/* Side lugs, with rivets where the bail meets them */}
      <path d="M27 160c-8 2-12 10-8 17" fill="none" stroke="url(#bkBrass)" strokeWidth="5" strokeLinecap="round" />
      <path d="M173 160c8 2 12 10 8 17" fill="none" stroke="url(#bkBrass)" strokeWidth="5" strokeLinecap="round" />
      <circle cx="30" cy="156" r="2.6" fill="#E5C05A" stroke="#6E4A0B" strokeWidth="0.7" />
      <circle cx="170" cy="156" r="2.6" fill="#E5C05A" stroke="#6E4A0B" strokeWidth="0.7" />

      {/* Flames BEHIND the pot, spreading wider than it */}
      <g className="bk-flame" filter="url(#bkGlowBlur)" opacity="0.55">
        <g transform="translate(26 258) scale(0.95)"><path d={FLAME_OUTER} fill="#F0731A" /></g>
        <g transform="translate(174 258) scale(-0.95 0.95)"><path d={FLAME_OUTER} fill="#F0731A" /></g>
      </g>
      <g className="bk-flame">
        <g transform="translate(28 256) scale(0.85)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.9" /></g>
        <g transform="translate(172 256) scale(-0.85 0.85)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.9" /></g>
        <g transform="translate(46 262) scale(0.62)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.75" /></g>
        <g transform="translate(154 262) scale(-0.62 0.62)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.75" /></g>
      </g>

      {/* ---- Firewood ---- */}
      <g>
        <g transform="rotate(-7 100 276)">
          <rect x="24" y="266" width="152" height="20" rx="10" fill="url(#bkLog)" />
          {/* Bark */}
          <path d="M44 271h96M52 276h92M60 281h76" stroke="#3F2410" strokeWidth="1.5" opacity="0.45" strokeLinecap="round" />
          <path d="M70 269c8 3 20 3 28 0M96 283c9 2 18 2 26-1" stroke="#2E1908" strokeWidth="1.1" opacity="0.35" fill="none" />
          {/* Cut end with growth rings */}
          <ellipse cx="24" cy="276" rx="6.5" ry="10" fill="url(#bkLogEnd)" />
          <ellipse cx="24" cy="276" rx="4" ry="6.4" fill="none" stroke="#7A4A24" strokeWidth="0.8" />
          <ellipse cx="24" cy="276" rx="1.8" ry="3" fill="none" stroke="#5E3413" strokeWidth="0.8" />
          {/* Charred where it meets the fire */}
          <path d="M96 266h68a10 10 0 0 1 10 10 10 10 0 0 1-10 10h-58z" fill="#1E1105" opacity="0.5" />
        </g>
        <g transform="rotate(6 100 292)">
          <rect x="34" y="284" width="134" height="18" rx="9" fill="url(#bkLog)" />
          <path d="M52 289h92M60 295h76" stroke="#3F2410" strokeWidth="1.4" opacity="0.45" strokeLinecap="round" />
          <ellipse cx="168" cy="293" rx="6" ry="9" fill="url(#bkLogEnd)" />
          <ellipse cx="168" cy="293" rx="3.6" ry="5.6" fill="none" stroke="#7A4A24" strokeWidth="0.8" />
          <path d="M40 284h58a9 9 0 0 1 0 18H44z" fill="#1E1105" opacity="0.45" />
        </g>
        {/* Embers glowing in the gap between the logs */}
        <g>
          <g filter="url(#bkGlowBlur)" opacity="0.8">
            <circle cx="74" cy="284" r="6" fill="#FF7A1A" />
            <circle cx="112" cy="282" r="5" fill="#FF9A2E" />
          </g>
          <circle cx="74" cy="284" r="2.8" fill="#FFC24E" />
          <circle cx="110" cy="282" r="2.3" fill="#FFB03A" />
          <circle cx="140" cy="287" r="1.9" fill="#FF8A22" />
        </g>
      </g>

      {/* Flames IN FRONT, rising off the logs and over the pot's foot */}
      <g className="bk-flame" filter="url(#bkGlowBlur)" opacity="0.5">
        <g transform="translate(100 276) scale(1.35)"><path d={FLAME_OUTER} fill="#F0731A" /></g>
        <g transform="translate(70 280) scale(1)"><path d={FLAME_OUTER} fill="#EE6A16" /></g>
        <g transform="translate(130 280) scale(-1 1)"><path d={FLAME_OUTER} fill="#EE6A16" /></g>
      </g>
      <g className="bk-flame">
        <g transform="translate(100 276) scale(1.22)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" /></g>
        <g transform="translate(70 280) scale(0.92)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.96" /></g>
        <g transform="translate(130 280) scale(-0.92 0.92)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.96" /></g>
        <g transform="translate(50 284) scale(0.6)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.85" /></g>
        <g transform="translate(150 284) scale(-0.6 0.6)"><path d={FLAME_OUTER} fill="url(#bkFlameOuter)" opacity="0.85" /></g>
      </g>
      <g className="bk-flame bk-flame-mid">
        <g transform="translate(100 276) scale(1.02)"><path d={FLAME_MID} fill="url(#bkFlameMid)" /></g>
        <g transform="translate(70 280) scale(0.76)"><path d={FLAME_MID} fill="url(#bkFlameMid)" opacity="0.94" /></g>
        <g transform="translate(130 280) scale(-0.76 0.76)"><path d={FLAME_MID} fill="url(#bkFlameMid)" opacity="0.94" /></g>
      </g>
      <g className="bk-flame bk-flame-inner">
        <g transform="translate(100 276) scale(0.95)"><path d={FLAME_INNER} fill="url(#bkFlameInner)" /></g>
        <g transform="translate(70 280) scale(0.62)"><path d={FLAME_INNER} fill="url(#bkFlameInner)" opacity="0.9" /></g>
        <g transform="translate(130 280) scale(-0.62 0.62)"><path d={FLAME_INNER} fill="url(#bkFlameInner)" opacity="0.9" /></g>
      </g>

      {/* Sparks drifting off the fire */}
      <g fill="#FFC24E">
        <circle cx="46" cy="228" r="1.8" opacity="0.75" />
        <circle cx="158" cy="216" r="1.5" opacity="0.6" />
        <circle cx="36" cy="200" r="1.2" opacity="0.5" />
        <circle cx="166" cy="242" r="1.4" opacity="0.55" />
        <circle cx="54" cy="248" r="1" opacity="0.5" />
      </g>
    </Box>
  );
});

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
