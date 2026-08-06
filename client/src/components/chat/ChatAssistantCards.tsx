import { Box, Chip, Link, Typography } from "@mui/material";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Link as RouterLink } from "react-router-dom";
import type { ChatCard } from "../../lib/chatTypes";
import { chatCardSx, chatUi } from "../../lib/chatAssistantTheme";
import { violationTypeLabel } from "../../lib/violationTypes";
import { violationsTo, vehicleReportTo } from "../../lib/chatNav";
import { formatChatDateRange } from "../../lib/chatDateFormat";
import { ChatCards } from "./ChatCards";

const newTab = { target: "_blank", rel: "noopener noreferrer" } as const;

const linkSx = {
  color: chatUi.primary,
  textDecoration: "none",
  "&:hover": { textDecoration: "underline" },
};

function ViolationSummaryDark({ card }: { card: Extract<ChatCard, { type: "violation_summary" }> }) {
  const allClear = card.total === 0;
  const to = violationsTo({
    from: card.from,
    to: card.to,
    cameraId: card.cameraId || undefined,
    plate: card.plate || undefined,
    type: card.violationType || undefined,
  });

  return (
    <Box sx={{ ...chatCardSx, mt: 1.5, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
      <Box sx={{ minWidth: 72 }}>
        <Typography
          component={RouterLink}
          {...newTab}
          to={to}
          sx={{
            ...linkSx,
            fontWeight: 800,
            fontSize: "2rem",
            lineHeight: 1,
            color: allClear ? chatUi.success : chatUi.primary,
          }}
        >
          {card.total.toLocaleString()}
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: chatUi.textSecondary, mt: 0.5 }}>violations</Typography>
      </Box>
      <Box sx={{ flex: 1, minWidth: 140 }}>
        {card.site ? (
          <Typography sx={{ fontSize: "0.8125rem", color: chatUi.textSecondary }}>
            Site: <Box component="span" sx={{ color: chatUi.text, fontWeight: 600 }}>{card.site}</Box>
          </Typography>
        ) : null}
        {card.violationType ? (
          <Typography sx={{ fontSize: "0.8125rem", color: chatUi.textSecondary }}>
            Violation Type:{" "}
            <Box component="span" sx={{ color: chatUi.text, fontWeight: 600 }}>
              {violationTypeLabel(card.violationType)}
            </Box>
          </Typography>
        ) : null}
        <Typography sx={{ fontSize: "0.8125rem", color: chatUi.textSecondary }}>
          Date:{" "}
          <Box component="span" sx={{ color: chatUi.text, fontWeight: 600 }}>
            {formatChatDateRange(card.from, card.to)}
          </Box>
        </Typography>
      </Box>
      {allClear ? (
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, color: chatUi.success }}>
          <CheckCircleOutlinedIcon />
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700 }}>All Clear</Typography>
        </Box>
      ) : null}
      <Link
        component={RouterLink}
        {...newTab}
        to={to}
        sx={{ ...linkSx, display: "inline-flex", alignItems: "center", gap: 0.5, fontSize: "0.8125rem", width: "100%" }}
      >
        View in Violations <OpenInNewIcon sx={{ fontSize: 14 }} />
      </Link>
    </Box>
  );
}

function ReadSummaryDark({ card }: { card: Extract<ChatCard, { type: "read_summary" }> }) {
  const to = vehicleReportTo({
    from: card.from,
    to: card.to,
    cameraId: card.cameraId || undefined,
    plate: card.plate || undefined,
  });
  return (
    <Box sx={{ ...chatCardSx, mt: 1.5 }}>
      <Typography
        component={RouterLink}
        {...newTab}
        to={to}
        sx={{ ...linkSx, fontWeight: 800, fontSize: "1.75rem", display: "block" }}
      >
        {card.total.toLocaleString()}
      </Typography>
      <Typography sx={{ fontSize: "0.8125rem", color: chatUi.textSecondary, mb: 1 }}>
        ANPR reads{card.site ? ` · ${card.site}` : ""} · {formatChatDateRange(card.from, card.to)}
      </Typography>
      <Link component={RouterLink} {...newTab} to={to} sx={{ ...linkSx, fontSize: "0.8125rem", display: "inline-flex", alignItems: "center", gap: 0.5 }}>
        View in Vehicle Report <OpenInNewIcon sx={{ fontSize: 14 }} />
      </Link>
    </Box>
  );
}

function CameraListDark({ card }: { card: Extract<ChatCard, { type: "camera_list" }> }) {
  return (
    <Box sx={{ ...chatCardSx, mt: 1.5 }}>
      <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: chatUi.text, mb: 1 }}>
        Monitored ANPR sites
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {card.cameras.map((c) => (
          <Chip
            key={c.cameraId}
            label={c.name}
            size="small"
            sx={{
              bgcolor: chatUi.surface,
              color: chatUi.text,
              border: chatUi.borderSubtle,
              "&::before": {
                content: '""',
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: chatUi.success,
                mr: 0.5,
              },
            }}
          />
        ))}
      </Box>
    </Box>
  );
}

function ViolationTypeRankDark({ card }: { card: Extract<ChatCard, { type: "violation_type_rank" }> }) {
  return (
    <Box sx={{ ...chatCardSx, mt: 1.5 }}>
      <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: chatUi.text, mb: 1 }}>
        Top violations by type · {formatChatDateRange(card.from, card.to)}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {card.types.map((t, i) => (
          <Link
            key={t.violationType}
            component={RouterLink}
            {...newTab}
            to={violationsTo({ from: card.from, to: card.to, type: t.violationType })}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              px: 1,
              py: 0.75,
              borderRadius: chatUi.radiusSm,
              color: chatUi.text,
              textDecoration: "none",
              "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
            }}
          >
            <Typography sx={{ fontWeight: i === 0 ? 800 : 600, fontSize: "0.875rem" }}>
              {i + 1}. {violationTypeLabel(t.violationType)}
            </Typography>
            <Typography sx={{ fontWeight: 800, color: chatUi.text }}>{t.count.toLocaleString()}</Typography>
          </Link>
        ))}
      </Box>
      <Link component={RouterLink} {...newTab} to={violationsTo({ from: card.from, to: card.to })} sx={{ ...linkSx, display: "inline-flex", alignItems: "center", gap: 0.5, mt: 1.25, fontSize: "0.8125rem" }}>
        View all in Violations <OpenInNewIcon sx={{ fontSize: 14 }} />
      </Link>
    </Box>
  );
}

function ViolationSiteRankDark({ card }: { card: Extract<ChatCard, { type: "violation_site_rank" }> }) {
  return (
    <Box sx={{ ...chatCardSx, mt: 1.5 }}>
      <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: chatUi.text, mb: 1 }}>
        Violation count by site{card.violationType ? ` · ${violationTypeLabel(card.violationType)}` : ""} · {formatChatDateRange(card.from, card.to)}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {card.sites.map((s, i) => (
          <Link
            key={s.cameraId}
            component={RouterLink}
            {...newTab}
            to={violationsTo({ from: card.from, to: card.to, cameraId: s.cameraId, type: card.violationType || undefined })}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              px: 1,
              py: 0.75,
              borderRadius: chatUi.radiusSm,
              color: chatUi.text,
              textDecoration: "none",
              "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
            }}
          >
            <Typography sx={{ fontWeight: i === 0 ? 800 : 600, fontSize: "0.875rem" }}>
              {i + 1}. {s.name}
            </Typography>
            <Typography sx={{ fontWeight: 800, color: chatUi.text }}>{s.count.toLocaleString()}</Typography>
          </Link>
        ))}
      </Box>
      <Link component={RouterLink} {...newTab} to={violationsTo({ from: card.from, to: card.to, type: card.violationType || undefined })} sx={{ ...linkSx, display: "inline-flex", alignItems: "center", gap: 0.5, mt: 1.25, fontSize: "0.8125rem" }}>
        View in Violations <OpenInNewIcon sx={{ fontSize: 14 }} />
      </Link>
    </Box>
  );
}

function ReadSiteRankDark({ card }: { card: Extract<ChatCard, { type: "read_site_rank" }> }) {
  return (
    <Box sx={{ ...chatCardSx, mt: 1.5 }}>
      <Typography sx={{ fontWeight: 700, fontSize: "0.875rem", color: chatUi.text, mb: 1 }}>
        ANPR reads by site · {formatChatDateRange(card.from, card.to)}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {card.sites.map((s, i) => (
          <Link
            key={s.cameraId}
            component={RouterLink}
            {...newTab}
            to={vehicleReportTo({ from: card.from, to: card.to, cameraId: s.cameraId })}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 1,
              px: 1,
              py: 0.75,
              borderRadius: chatUi.radiusSm,
              color: chatUi.text,
              textDecoration: "none",
              "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
            }}
          >
            <Typography sx={{ fontWeight: i === 0 ? 800 : 600, fontSize: "0.875rem" }}>
              {i + 1}. {s.name}
            </Typography>
            <Typography sx={{ fontWeight: 800, color: chatUi.text }}>{s.count.toLocaleString()}</Typography>
          </Link>
        ))}
      </Box>
      <Link component={RouterLink} {...newTab} to={vehicleReportTo({ from: card.from, to: card.to })} sx={{ ...linkSx, display: "inline-flex", alignItems: "center", gap: 0.5, mt: 1.25, fontSize: "0.8125rem" }}>
        View in Vehicle Report <OpenInNewIcon sx={{ fontSize: 14 }} />
      </Link>
    </Box>
  );
}

const darkCardWrapSx = {
  mt: 1,
  "& .MuiTypography-root": { color: `${chatUi.text} !important` },
  "& .MuiTypography-colorTextSecondary, & [class*='textSecondary']": {
    color: `${chatUi.textSecondary} !important`,
  },

  "& div": { color: `${chatUi.text} !important` },
  "& div[style], & .MuiBox-root": {
    bgcolor: `${chatUi.surfaceElevated} !important`,
    borderColor: "rgba(148, 163, 184, 0.14) !important",
  },
  "& a": { color: `${chatUi.primary} !important` },
  "& .MuiChip-root": {
    bgcolor: chatUi.surface,
    color: chatUi.text,
    borderColor: "rgba(148,163,184,0.2)",
  },
};

export function ChatAssistantCards({ cards }: { cards: ChatCard[] }) {
  if (!cards.length) return null;

  return (
    <Box sx={{ maxWidth: 640 }}>
      {cards.map((card, i) => {
        const key = `${card.type}-${i}`;
        if (card.type === "violation_summary") return <ViolationSummaryDark key={key} card={card} />;
        if (card.type === "read_summary") return <ReadSummaryDark key={key} card={card} />;
        if (card.type === "camera_list") return <CameraListDark key={key} card={card} />;
        if (card.type === "violation_type_rank") return <ViolationTypeRankDark key={key} card={card} />;
        if (card.type === "violation_site_rank") return <ViolationSiteRankDark key={key} card={card} />;
        if (card.type === "read_site_rank") return <ReadSiteRankDark key={key} card={card} />;
        return (
          <Box key={key} sx={darkCardWrapSx}>
            <ChatCards cards={[card]} />
          </Box>
        );
      })}
    </Box>
  );
}
