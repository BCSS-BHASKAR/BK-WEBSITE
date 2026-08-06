import { Box, Skeleton, Typography } from "@mui/material";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import { pnp, pnpFont } from "../../lib/pnpTheme";
import { formatDbNaiveInDisplay } from "../../lib/siteTimeZone";

type Row = { id: number; plate: string; created_at: string; list_name: string };

type Props = {
  hits: number;
  rows: Row[];
  activeWatchlists?: number;
  lastHit?: string | null;
  pending?: boolean;
};

const footerBoxSx = {
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: 0.75,
  px: 1.25,
  py: 1,
  borderRadius: "8px",
  bgcolor: "#FFFFFF",
  border: "1px solid rgba(15, 23, 42, 0.08)",
  minWidth: 0,
};

export function WatchlistHitsPanel({ hits, rows, activeWatchlists, lastHit, pending }: Props) {
  if (pending) {
    return <Skeleton variant="rounded" height={220} sx={{ borderRadius: 2 }} />;
  }

  if (hits > 0 && rows.length) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1 }}>
        {rows.slice(0, 5).map((r) => (
          <Box
            key={r.id}
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              py: 0.85,
              borderBottom: "1px solid rgba(15,23,42,0.06)",
            }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: "0.875rem" }}>{r.plate}</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }}>{r.list_name}</Typography>
          </Box>
        ))}
        <WatchlistFooter activeWatchlists={activeWatchlists} lastHit={lastHit ?? rows[0]?.created_at} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 200 }}>
      <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", py: 2.5 }}>
        <Box
          sx={{
            width: 80,
            height: 80,
            borderRadius: "50%",
            bgcolor: pnp.purpleSoft,
            border: `1px solid rgba(124, 58, 237, 0.2)`,
            display: "grid",
            placeItems: "center",
            mb: 1.25,
          }}
        >
          <ShieldOutlinedIcon sx={{ fontSize: 36, color: pnp.purple, opacity: 0.9 }} />
        </Box>
        <Typography sx={{ fontSize: "2.75rem", fontWeight: 800, color: pnp.textMuted, lineHeight: 1 }}>{hits}</Typography>
        <Typography sx={{ ...pnpFont.cardSubtitle, mt: 0.85, textAlign: "center", px: 1 }}>No watchlist hits in this period</Typography>
      </Box>
      <WatchlistFooter activeWatchlists={activeWatchlists} lastHit={lastHit} />
    </Box>
  );
}

function WatchlistFooter({ activeWatchlists, lastHit }: { activeWatchlists?: number; lastHit?: string | null }) {
  const lastLabel = lastHit ? formatDbNaiveInDisplay(lastHit, "D MMM, h:mm A") : "—";
  return (
    <Box sx={{ display: "flex", gap: 1, mt: "auto", flexShrink: 0 }}>
      <Box sx={footerBoxSx}>
        <ShieldOutlinedIcon sx={{ fontSize: 18, color: pnp.primary }} />
        <Box>
          <Typography sx={{ fontSize: "0.625rem", fontWeight: 600, color: pnp.textMuted, lineHeight: 1.2 }}>Active watchlists</Typography>
          <Typography sx={{ fontSize: "0.875rem", fontWeight: 800, color: pnp.text, lineHeight: 1.2 }}>{activeWatchlists ?? "—"}</Typography>
        </Box>
      </Box>
      <Box sx={{ ...footerBoxSx, flexDirection: "column", alignItems: "flex-start", gap: 0.15 }}>
        <Typography sx={{ fontSize: "0.625rem", fontWeight: 600, color: pnp.textMuted }}>Last hit</Typography>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: pnp.text }}>{lastLabel}</Typography>
      </Box>
    </Box>
  );
}
