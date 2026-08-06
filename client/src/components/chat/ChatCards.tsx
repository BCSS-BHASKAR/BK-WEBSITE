import { Box, Chip, Link, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Link as RouterLink } from "react-router-dom";
import type { ChatCard } from "../../lib/chatTypes";
import { contentCardSx } from "../../lib/uiSurfaces";
import { pnp } from "../../lib/pnpTheme";
import { violationTypeLabel, VIOLATION_DASHBOARD_ORDER } from "../../lib/violationTypes";
import { violationsTo, vehicleReportTo, watchlistsTo } from "../../lib/chatNav";
import type { ViolationsOpenParams } from "../../lib/chatNav";
import { formatChatDateLabel, formatChatDateRange } from "../../lib/chatDateFormat";
import { ymdSite } from "../../lib/siteTimeZone";
import { receiverImageUrl } from "../../lib/receiverImageUrl";

const newTab = { target: "_blank", rel: "noopener noreferrer" } as const;

const navLinkSx = {
  color: "inherit",
  textDecoration: "none",
  "&:hover": { textDecoration: "underline", color: pnp.primary },
};

const rowNavSx = {
  ...navLinkSx,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderRadius: 1,
  py: 0.25,
  px: 0.5,
  mx: -0.5,
  "&:hover": { bgcolor: "rgba(37, 99, 235, 0.06)", textDecoration: "none" },
};

function CardFooterLink({ to, label }: { to: { pathname: string; search?: string }; label: string }) {
  return (
    <Link
      component={RouterLink}
      to={to}
      {...newTab}
      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, mt: 1.5, fontSize: "0.8125rem" }}
    >
      {label} <OpenInNewIcon sx={{ fontSize: 14, opacity: 0.7 }} />
    </Link>
  );
}

function violationFilters(card: {
  from: string;
  to: string;
  cameraId?: string | null;
  plate?: string | null;
  violationType?: string | null;
}): ViolationsOpenParams {
  return {
    from: card.from,
    to: card.to,
    cameraId: card.cameraId || undefined,
    plate: card.plate || undefined,
    type: card.violationType || undefined,
  };
}

function imageSrc(path: string | null | undefined): string {
  return receiverImageUrl(path);
}

function PlateSummaryCard({ card }: { card: Extract<ChatCard, { type: "plate_summary" }> }) {
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 800, fontSize: "1rem", mb: 1 }}>{card.plate}</Typography>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: "wrap" }}>
        <Chip
          component={RouterLink}
          {...newTab}
          clickable
          to={vehicleReportTo({ from: card.from, to: card.to, plate: card.plate })}
          {...newTab}
          size="small"
          label={`${card.anprCount} ANPR reads`}
          color="primary"
          variant="outlined"
        />
        {card.violationCount > 0 ? (
          <Chip
            component={RouterLink}
            {...newTab}
            clickable
            to={violationsTo({ from: card.from, to: card.to, plate: card.plate })}
            {...newTab}
            size="small"
            label={`${card.violationCount} violations`}
            color="warning"
            variant="outlined"
          />
        ) : (
          <Chip size="small" label="0 violations" variant="outlined" />
        )}
        <Chip size="small" label={`${card.from} → ${card.to}`} variant="outlined" />
      </Stack>
      {card.firstSeen || card.lastSeen ? (
        <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary, mb: 1 }}>
          {card.firstSeen ? `First: ${card.firstSeen}` : null}
          {card.firstSeen && card.lastSeen ? " · " : null}
          {card.lastSeen ? `Last: ${card.lastSeen}` : null}
        </Typography>
      ) : null}
      {card.sites.length > 0 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {card.sites.map((s) => (
            <Chip
              key={s.cameraId}
              component={RouterLink}
              {...newTab}
              clickable
              to={vehicleReportTo({ from: card.from, to: card.to, plate: card.plate, cameraId: s.cameraId })}
              {...newTab}
              size="small"
              label={`${s.name} (${s.count})`}
            />
          ))}
        </Box>
      ) : null}
      <CardFooterLink
        to={vehicleReportTo({ from: card.from, to: card.to, plate: card.plate })}
        label="Open in Vehicle Report"
      />
      {card.violationCount > 0 ? (
        <CardFooterLink
          to={violationsTo({ from: card.from, to: card.to, plate: card.plate })}
          label="Open violations for this plate"
        />
      ) : null}
    </Box>
  );
}

function PlateSightingsCard({ card }: { card: Extract<ChatCard, { type: "plate_sightings" }> }) {
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Recent sightings — {card.plate}</Typography>
      <Stack spacing={1}>
        {card.rows.map((r) => (
          <Box
            key={r.id}
            sx={{
              display: "flex",
              gap: 1.25,
              alignItems: "center",
              p: 1,
              borderRadius: 1,
              border: pnp.cardBorder,
            }}
          >
            {r.thumbnailUrl || r.fullImageUrl ? (
              <Box
                component="img"
                src={imageSrc(r.thumbnailUrl || r.fullImageUrl)}
                alt=""
                sx={{ width: 72, height: 48, objectFit: "cover", borderRadius: 1, bgcolor: "#f1f5f9" }}
              />
            ) : null}
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 600, fontSize: "0.875rem" }}>{r.site}</Typography>
              <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }}>{r.detectedAt}</Typography>
            </Box>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}

function PlateViolationsCard({ card }: { card: Extract<ChatCard, { type: "plate_violations" }> }) {
  if (!card.rows.length) {
    return (
      <Box sx={{ ...contentCardSx, mt: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>Violations — {card.plate}</Typography>
        <Typography sx={{ fontSize: "0.875rem", color: pnp.textSecondary, mt: 0.5 }}>None in this period.</Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Violations — {card.plate}</Typography>
      <Stack spacing={1}>
        {card.rows.map((r) => (
          <Box
            key={r.id}
            sx={{
              display: "flex",
              gap: 1.25,
              alignItems: "center",
              p: 1,
              borderRadius: 1,
              border: pnp.cardBorder,
            }}
          >
            {r.fullImageUrl ? (
              <Box
                component="img"
                src={imageSrc(r.fullImageUrl)}
                alt=""
                sx={{ width: 72, height: 48, objectFit: "cover", borderRadius: 1, bgcolor: "#f1f5f9" }}
              />
            ) : null}
            <Box sx={{ minWidth: 0 }}>
              <Chip size="small" label={violationTypeLabel(r.violationType)} color="warning" sx={{ mb: 0.5 }} />
              <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }}>
                {r.site} · {r.detectedAt}
              </Typography>
            </Box>
          </Box>
        ))}
      </Stack>
      <CardFooterLink
        to={violationsTo({ from: ymdSite(), to: ymdSite(), plate: card.plate })}
        label="Open in Violations"
      />
    </Box>
  );
}

function ViolationSummaryCard({ card }: { card: Extract<ChatCard, { type: "violation_summary" }> }) {
  const types = VIOLATION_DASHBOARD_ORDER.filter((t) => (card.byType[t] || 0) > 0);
  const extra = Object.entries(card.byType).filter(
    ([k, v]) => v > 0 && !VIOLATION_DASHBOARD_ORDER.includes(k as (typeof VIOLATION_DASHBOARD_ORDER)[number])
  );
  const base = violationFilters(card);
  const filteredViolations = violationsTo(base);

  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Link component={RouterLink} {...newTab} to={filteredViolations} sx={navLinkSx}>
        <Typography sx={{ fontWeight: 800, fontSize: "1.5rem", color: pnp.primary }}>
          {card.total.toLocaleString()}
        </Typography>
      </Link>
      <Link component={RouterLink} {...newTab} to={filteredViolations} sx={{ ...navLinkSx, display: "block", mb: 1.5 }}>
        <Typography sx={{ fontSize: "0.875rem", color: pnp.textSecondary }}>
          violations{card.site ? ` · ${card.site}` : ""}
          {card.plate ? ` · ${card.plate}` : ""}
          {card.violationType ? ` · ${violationTypeLabel(card.violationType)}` : ""} ·{" "}
          {formatChatDateRange(card.from, card.to)}
        </Typography>
      </Link>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {types.map((t) => (
          <Chip
            key={t}
            component={RouterLink}
            {...newTab}
            clickable
            to={violationsTo({ ...base, type: t })}
            size="small"
            label={`${violationTypeLabel(t)}: ${card.byType[t]}`}
            sx={{ "&:hover": { bgcolor: pnp.primarySoft } }}
          />
        ))}
        {extra.map(([t, n]) => (
          <Chip
            key={t}
            component={RouterLink}
            {...newTab}
            clickable
            to={violationsTo({ ...base, type: t })}
            size="small"
            label={`${violationTypeLabel(t)}: ${n}`}
            variant="outlined"
          />
        ))}
      </Box>
      <CardFooterLink
        to={filteredViolations}
        label={
          card.violationType
            ? `View ${violationTypeLabel(card.violationType)} in Violations`
            : "View all in Violations"
        }
      />
    </Box>
  );
}

function formatHourLabel(h: number) {
  if (h === 0) return "12:00 AM";
  if (h < 12) return `${h}:00 AM`;
  if (h === 12) return "12:00 PM";
  return `${h - 12}:00 PM`;
}

function timeRangeSubtitle(
  hourFrom?: number | null,
  hourTo?: number | null,
  timeSpansMidnight?: boolean
) {
  if (hourFrom == null || hourTo == null) return "";
  if (hourFrom === hourTo) return ` · ${formatHourLabel(hourFrom)}`;
  const overnight = timeSpansMidnight || hourFrom > hourTo;
  return ` · ${formatHourLabel(hourFrom)}–${formatHourLabel(hourTo)}${overnight ? " (overnight)" : ""}`;
}

function formatCardDateRange(from: string, to: string, timeSpansMidnight?: boolean) {
  if (timeSpansMidnight && from !== to) {
    return `${formatChatDateLabel(from)} → ${formatChatDateLabel(to)} (overnight)`;
  }
  return formatChatDateRange(from, to);
}

function ReadSummaryCard({ card }: { card: Extract<ChatCard, { type: "read_summary" }> }) {
  const reportTo = vehicleReportTo({
    from: card.from,
    to: card.to,
    cameraId: card.cameraId || undefined,
    plate: card.plate || undefined,
    hour: card.from === card.to && card.hourFrom != null ? card.hourFrom : undefined,
  });
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Link component={RouterLink} {...newTab} to={reportTo} sx={navLinkSx}>
        <Typography sx={{ fontWeight: 800, fontSize: "1.5rem", color: pnp.kpiGreen }}>
          {card.total.toLocaleString()}
        </Typography>
      </Link>
      <Link component={RouterLink} {...newTab} to={reportTo} sx={{ ...navLinkSx, display: "block" }}>
        <Typography sx={{ fontSize: "0.875rem", color: pnp.textSecondary }}>
          ANPR reads{card.site ? ` · ${card.site}` : ""}
          {card.plate ? ` · ${card.plate}` : ""}
          {timeRangeSubtitle(card.hourFrom, card.hourTo, card.timeSpansMidnight)} ·{" "}
          {formatCardDateRange(card.from, card.to, card.timeSpansMidnight)}
        </Typography>
      </Link>
      <CardFooterLink to={reportTo} label="View in Vehicle Report" />
    </Box>
  );
}

function OperationsSummaryCard({ card }: { card: Extract<ChatCard, { type: "operations_summary" }> }) {
  const d = card.display;
  const readsTo = vehicleReportTo({ from: card.from, to: card.to });
  const violTo = violationsTo({ from: card.from, to: card.to });
  const topTypeTo = card.topViolationType
    ? violationsTo({ from: card.from, to: card.to, type: card.topViolationType })
    : null;
  const topReadSiteTo =
    card.busiestReadCameraId
      ? vehicleReportTo({ from: card.from, to: card.to, cameraId: card.busiestReadCameraId })
      : null;
  const topViolSiteTo =
    card.busiestViolationCameraId
      ? violationsTo({ from: card.from, to: card.to, cameraId: card.busiestViolationCameraId })
      : null;

  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>
        {d?.title ?? "Operational summary"} · {formatChatDateLabel(card.from)}
      </Typography>
      <Stack spacing={0.5}>
        <Link component={RouterLink} {...newTab} to={readsTo} sx={{ ...navLinkSx, fontSize: "0.9375rem" }}>
          <strong>{card.totalReads.toLocaleString()}</strong> {d?.reads ?? "ANPR reads"} ·{" "}
          <strong>{card.uniquePlates.toLocaleString()}</strong> {d?.plates ?? "distinct plates"}
        </Link>
        <Typography sx={{ fontSize: "0.9375rem" }}>
          <Link component={RouterLink} {...newTab} to={violTo} sx={navLinkSx}>
            <strong>{card.violationCount.toLocaleString()}</strong> {d?.violations ?? "violations"}
          </Link>
          {card.topViolationType && topTypeTo ? (
            <>
              {" "}
              · {d?.leadingType ?? "leading type"}:{" "}
              <Link component={RouterLink} {...newTab} to={topTypeTo} sx={{ ...navLinkSx, fontWeight: 700 }}>
                {violationTypeLabel(card.topViolationType)}
              </Link>
            </>
          ) : null}
        </Typography>
        {card.busiestReadSite ? (
          <Link
            component={RouterLink}
            {...newTab}
            to={topReadSiteTo ?? readsTo}
            sx={{ ...navLinkSx, fontSize: "0.8125rem", color: pnp.textSecondary }}
          >
            {d?.mostReads ?? "Most reads"}: {card.busiestReadSite} ({card.busiestReadCount.toLocaleString()})
          </Link>
        ) : null}
        {card.busiestViolationSite ? (
          <Link
            component={RouterLink}
            {...newTab}
            to={topViolSiteTo ?? violTo}
            sx={{ ...navLinkSx, fontSize: "0.8125rem", color: pnp.textSecondary }}
          >
            {d?.highestViolations ?? "Highest violations"}: {card.busiestViolationSite} (
            {card.busiestViolationCount.toLocaleString()})
          </Link>
        ) : null}
      </Stack>
      <Stack direction="row" spacing={2} sx={{ mt: 1.5, flexWrap: "wrap" }}>
        <CardFooterLink to={readsTo} label="Vehicle Report" />
        <CardFooterLink to={violTo} label="Violations" />
      </Stack>
    </Box>
  );
}

function TopPlatesCard({ card }: { card: Extract<ChatCard, { type: "top_plates" }> }) {
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Most observed plates · {formatCardDateRange(card.from, card.to)}</Typography>
      {card.plates.map((p, i) => (
        <Link
          key={p.plate}
          component={RouterLink}
          {...newTab}
          to={vehicleReportTo({ from: card.from, to: card.to, plate: p.plate })}
          sx={rowNavSx}
        >
          <Typography sx={{ fontWeight: i === 0 ? 800 : 500 }}>{i + 1}. {p.plate}</Typography>
          <Typography sx={{ fontWeight: 700 }}>{p.count.toLocaleString()}</Typography>
        </Link>
      ))}
    </Box>
  );
}

function SimpleMetricCard({ card }: { card: ChatCard }) {
  if (card.type === "peak_hour") {
    const hour = card.hour != null ? Number(card.hour) : undefined;
    const dest =
      card.metric === "violations"
        ? violationsTo({ from: card.from, to: card.to })
        : vehicleReportTo({
            from: card.from,
            to: card.to,
            hour: card.from === card.to ? hour : undefined,
          });
    return (
      <Box sx={{ ...contentCardSx, mt: 1 }}>
        <Typography sx={{ fontWeight: 700, mb: 0.5 }}>
          Peak activity ({card.metric}) · {formatCardDateRange(card.from, card.to)}
        </Typography>
        <Link component={RouterLink} {...newTab} to={dest} sx={navLinkSx}>
          <Typography sx={{ fontSize: "1.125rem", fontWeight: 800 }}>
            {card.hour != null ? `${String(card.hour).padStart(2, "0")}:00` : "—"} · {card.count.toLocaleString()}
          </Typography>
        </Link>
        <CardFooterLink
          to={dest}
          label={card.metric === "violations" ? "View violations" : "View ANPR reads"}
        />
      </Box>
    );
  }
  if (card.type === "vehicle_mix") {
    const pct = card.total ? Math.round((card.privateCount / card.total) * 100) : 0;
    return (
      <Box sx={{ ...contentCardSx, mt: 1 }}>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>Vehicle mix · {formatCardDateRange(card.from, card.to)}</Typography>
        <Typography sx={{ fontSize: "0.9375rem" }}>
          Private/electric: <strong>{card.privateCount.toLocaleString()}</strong> · PUV:{" "}
          <strong>{card.puvCount.toLocaleString()}</strong> ({pct}% private)
        </Typography>
      </Box>
    );
  }
  if (card.type === "period_compare") {
    const up = card.delta >= 0;
    return (
      <Box sx={{ ...contentCardSx, mt: 1 }}>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>
          Today vs yesterday ({card.metric}) · through {String(card.throughHour).padStart(2, "0")}:00
        </Typography>
        <Typography sx={{ fontSize: "0.9375rem" }}>
          Today: <strong>{card.todayCount.toLocaleString()}</strong> · Yesterday:{" "}
          <strong>{card.yesterdayCount.toLocaleString()}</strong> ·{" "}
          <Box component="span" sx={{ color: up ? pnp.kpiGreen : pnp.kpiOrange, fontWeight: 700 }}>
            {up ? "+" : ""}
            {card.delta.toLocaleString()}
          </Box>
        </Typography>
      </Box>
    );
  }
  if (card.type === "watchlist_hits") {
    return (
      <Box sx={{ ...contentCardSx, mt: 1 }}>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>Watchlist hits · {formatCardDateRange(card.from, card.to)}</Typography>
        <Link component={RouterLink} {...newTab} to={watchlistsTo()} sx={navLinkSx}>
          <Typography sx={{ fontSize: "1rem", fontWeight: 800, mb: card.samples.length ? 1 : 0 }}>
            {card.total.toLocaleString()} hit{card.total === 1 ? "" : "s"}
          </Typography>
        </Link>
        {card.samples.map((s) => (
          <Link
            key={`${s.plate}-${s.listName}`}
            component={RouterLink}
            {...newTab}
            to={vehicleReportTo({ from: card.from, to: card.to, plate: s.plate })}
            sx={{ ...navLinkSx, display: "block", fontSize: "0.8125rem", color: pnp.textSecondary }}
          >
            {s.plate} · {s.listName}
          </Link>
        ))}
        <CardFooterLink to={watchlistsTo()} label="Open Watchlists" />
      </Box>
    );
  }
  if (card.type === "metric_count") {
    const label =
      card.metric === "unique_plates"
        ? "Distinct plates"
        : card.metric.replace(/_/g, " ");
    const reportTo = vehicleReportTo({ from: card.from, to: card.to });
    return (
      <Box sx={{ ...contentCardSx, mt: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>
          {label}
          {card.site ? ` · ${card.site}` : ""} · {formatCardDateRange(card.from, card.to)}
        </Typography>
        <Link component={RouterLink} {...newTab} to={reportTo} sx={navLinkSx}>
          <Typography sx={{ fontSize: "1.25rem", fontWeight: 800, mt: 0.5 }}>{card.total.toLocaleString()}</Typography>
        </Link>
        <CardFooterLink to={reportTo} label="View in Vehicle Report" />
      </Box>
    );
  }
  return null;
}

function ReadSiteRankCard({ card }: { card: Extract<ChatCard, { type: "read_site_rank" }> }) {
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>
        ANPR reads by site · {formatCardDateRange(card.from, card.to)}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {card.sites.map((s, i) => (
          <Link
            key={s.cameraId}
            component={RouterLink}
            {...newTab}
            to={vehicleReportTo({ from: card.from, to: card.to, cameraId: s.cameraId })}
            sx={rowNavSx}
          >
            <Typography sx={{ fontWeight: i === 0 ? 800 : 500, fontSize: "0.9375rem" }}>
              {i + 1}. {s.name}
            </Typography>
            <Typography sx={{ fontWeight: 700, color: i === 0 ? pnp.kpiGreen : pnp.navy }}>
              {s.count.toLocaleString()}
            </Typography>
          </Link>
        ))}
      </Box>
    </Box>
  );
}

function ViolationSiteRankCard({ card }: { card: Extract<ChatCard, { type: "violation_site_rank" }> }) {
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>
        Violation count by site
        {card.violationType ? ` · ${violationTypeLabel(card.violationType)}` : ""}
        {timeRangeSubtitle(card.hourFrom, card.hourTo, card.timeSpansMidnight)} ·{" "}
        {formatCardDateRange(card.from, card.to, card.timeSpansMidnight)}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {card.sites.map((s, i) => (
          <Link
            key={s.cameraId}
            component={RouterLink}
            {...newTab}
            to={violationsTo({
              from: card.from,
              to: card.to,
              cameraId: s.cameraId,
              type: card.violationType || undefined,
            })}
            sx={rowNavSx}
          >
            <Typography sx={{ fontWeight: i === 0 ? 800 : 500, fontSize: "0.9375rem" }}>
              {i + 1}. {s.name}
            </Typography>
            <Typography sx={{ fontWeight: 700, color: i === 0 ? pnp.kpiGreen : pnp.navy }}>
              {s.count.toLocaleString()}
            </Typography>
          </Link>
        ))}
      </Box>
    </Box>
  );
}

function ViolationTypeRankCard({ card }: { card: Extract<ChatCard, { type: "violation_type_rank" }> }) {
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>
        Violation count by type · {formatCardDateRange(card.from, card.to, card.timeSpansMidnight)}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        {card.types.map((t, i) => (
          <Link
            key={t.violationType}
            component={RouterLink}
            {...newTab}
            to={violationsTo({ from: card.from, to: card.to, type: t.violationType })}
            sx={rowNavSx}
          >
            <Typography sx={{ fontWeight: i === 0 ? 800 : 500, fontSize: "0.9375rem" }}>
              {i + 1}. {violationTypeLabel(t.violationType)}
            </Typography>
            <Typography sx={{ fontWeight: 700, color: i === 0 ? pnp.kpiGreen : pnp.navy }}>
              {t.count.toLocaleString()}
            </Typography>
          </Link>
        ))}
      </Box>
    </Box>
  );
}

function CameraListCard({ card }: { card: Extract<ChatCard, { type: "camera_list" }> }) {
  return (
    <Box sx={{ ...contentCardSx, mt: 1 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Monitored ANPR sites</Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
        {card.cameras.map((c) => (
          <Chip key={c.cameraId} label={c.name} />
        ))}
      </Box>
    </Box>
  );
}

export function ChatCards({ cards }: { cards: ChatCard[] }) {
  if (!cards.length) return null;
  return (
    <Box sx={{ maxWidth: 560 }}>
      {cards.map((card, i) => {
        const key = `${card.type}-${i}`;
        switch (card.type) {
          case "plate_summary":
            return <PlateSummaryCard key={key} card={card} />;
          case "plate_sightings":
            return <PlateSightingsCard key={key} card={card} />;
          case "plate_violations":
            return <PlateViolationsCard key={key} card={card} />;
          case "violation_summary":
            return <ViolationSummaryCard key={key} card={card} />;
          case "read_summary":
            return <ReadSummaryCard key={key} card={card} />;
          case "camera_list":
            return <CameraListCard key={key} card={card} />;
          case "violation_site_rank":
            return <ViolationSiteRankCard key={key} card={card} />;
          case "violation_type_rank":
            return <ViolationTypeRankCard key={key} card={card} />;
          case "read_site_rank":
            return <ReadSiteRankCard key={key} card={card} />;
          case "operations_summary":
            return <OperationsSummaryCard key={key} card={card} />;
          case "top_plates":
            return <TopPlatesCard key={key} card={card} />;
          case "peak_hour":
          case "vehicle_mix":
          case "period_compare":
          case "metric_count":
          case "watchlist_hits":
            return <SimpleMetricCard key={key} card={card} />;
          default:
            return null;
        }
      })}
    </Box>
  );
}
