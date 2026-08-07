import { Box, type SxProps, type Theme } from "@mui/material";
import { PNP_BADGE_SRC } from "../lib/pnpAssets";
import { SITE_BRANDING } from "../i18n/lang";

type Props = {

  size?: number;
  alt?: string;
  sx?: SxProps<Theme>;
};

export function PnpBadge({ size = 130, alt = SITE_BRANDING.productName, sx }: Props) {
  return (
    <Box
      component="img"
      src={PNP_BADGE_SRC}
      alt={alt}
      sx={{
        width: size,
        height: size,
        maxWidth: "100%",
        objectFit: "contain",
        objectPosition: "center center",
        display: "block",
        flexShrink: 0,
        filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.35))",
        ...sx,
      }}
    />
  );
}
