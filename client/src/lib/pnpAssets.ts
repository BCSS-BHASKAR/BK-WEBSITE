

const base = import.meta.env.BASE_URL;

// The official Biryani Katha mark, taken from biryanikatha.com rather than
// redrawn. It is a square 1600x1600 PNG, so consumers size it 1:1 - the old
// BrandBadge.svg was a tall crest and its callers applied a 1.38 height ratio.
export const PNP_BADGE_SRC = `${base}BiryaniKathaLogo.png`;

export const LEGACY_LOGO_SRC = `${base}Logo.png`;

export const ACCESS_GENIE_LOGO_SRC = `${base}AccessGenieLogo.svg`;
