import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  LinearProgress,
  Link,
  Paper,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LocalPoliceOutlinedIcon from "@mui/icons-material/LocalPoliceOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import AutorenewOutlinedIcon from "@mui/icons-material/AutorenewOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import PolicyIcon from "@mui/icons-material/Policy";
import ReceiptLongOutlinedIcon from "@mui/icons-material/ReceiptLongOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import { SegmentTabBar } from "../components/SegmentTabBar";
import { SITE_LABELS } from "../i18n/lang";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import FlipIcon from "@mui/icons-material/Flip";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Pie, PieChart, Cell, ResponsiveContainer, Tooltip as ReTooltip } from "recharts";
import { api } from "../lib/api";
import { contentCardSx, gridCols, pageLayoutSx } from "../lib/uiSurfaces";
import { filterRowTextFieldSlotProps, filterRowJumpToTodaySx } from "../lib/filterRowControls";
import { pnp } from "../lib/pnpTheme";
import { ymdSite, ymdSiteYesterday, dayjsInSite } from "../lib/siteTimeZone";
import { defaultTodayRange, daysInclusive } from "../lib/dashboardRange";
import { violationTypeLabel, VIOLATION_TYPE_META, violationTypesByCount } from "../lib/violationTypes";
import { isConfirmedPlate } from "../lib/plateConfirm";
import { ChallanHistoryPanel } from "../components/challan/ChallanHistoryPanel";
import { violationEventPath } from "../lib/violationNav";
import { TCT_OFFENSES, OTHERS_CODE } from "../lib/tctOffenses";
import { receiverImageUrl } from "../lib/receiverImageUrl";
import { useCameras } from "../hooks/useCameras";
import MenuItem from "@mui/material/MenuItem";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import BoltIcon from "@mui/icons-material/Bolt";
import { SITE_TIMEZONE } from "../config/siteConfig";

type FeedRow = {
  id: number;
  plate: string;
  violationType: string;
  score: number;
  cameraId: string;
  siteName?: string;
  detectedAt: string;
  createdAt?: string;
  sceneUrl: string | null;
  plateUrl: string | null;
};

type ChallanRow = {
  id: number;
  plate: string;
  violationType: string;
  amount: number;
  siteName: string | null;
  cameraId: string | null;
  detectedAt: string | null;
  proofUrl: string | null;
  ownerEmail: string;
  ownerName: string | null;
  status: string;
  paymentStatus?: string;
  penaltyType?: string;
};

function money(n: number) {
  return `₱ ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function imgUrl(u: string) {
  return receiverImageUrl(u);
}

function kpiChipSx() {
  return {
    bgcolor: "rgba(15,23,42,0.72)",
    color: "rgba(248,250,252,0.92)",
    border: "1px solid rgba(148,163,184,0.28)",
    backdropFilter: "blur(10px)",
  } as const;
}

const AMOUNTS: Record<string, number> = {
  WRONG_PARKING: 1000,
  NO_HELMET: 500,
  WRONG_ROUTE: 750,
  TRIPLE_RIDING: 1500,
};

const primaryActionBtnSx = {
  borderRadius: 2,
  py: 1.15,
  fontWeight: 900,
  color: "#fff",
  background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 55%, #1E40AF 100%)",
  textTransform: "none",
  boxShadow: "0 16px 34px rgba(37, 99, 235, 0.28)",
  "&:hover": {
    background: "linear-gradient(135deg, #1D4ED8 0%, #1E40AF 55%, #1E3A8A 100%)",
  },
  "&.Mui-disabled": {
    background: "rgba(15,23,42,0.12)",
    color: "rgba(15,23,42,0.42)",
    boxShadow: "none",
  },
} as const;

const sectionCardSx = {
  p: 2,
  borderRadius: 3,
  bgcolor: "#fff",
  border: "1px solid rgba(15,23,42,0.08)",
  boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 16px 32px -22px rgba(15,23,42,0.45)",
} as const;

const sectionTitleSx = {
  fontWeight: 800,
  fontSize: "0.9rem",
  color: "rgba(15,23,42,0.92)",
  mb: 1.25,
} as const;

export function ChallanEmailPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const pageTab = searchParams.get("tab") === "history" ? "history" : "create";
  const setPageTab = useCallback(
    (tab: "create" | "history") => {
      if (tab === "history") setSearchParams({ tab: "history" });
      else setSearchParams({});
    },
    [setSearchParams]
  );

  const today = ymdSite();
  const yesterday = ymdSiteYesterday();

  const [from, setFrom] = useState(yesterday);
  const [to, setTo] = useState(today);
  const [order] = useState<"asc" | "desc">("desc");
  const [feedCameraId, setFeedCameraId] = useState("");
  const [feedType, setFeedType] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const camerasQ = useCameras();
  const cameraFilterOptions = useMemo(
    () =>
      Object.entries(camerasQ.data?.cameraMap ?? {})
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [camerasQ.data?.cameraMap]
  );

  const spanDays = useMemo(() => daysInclusive(from, to), [from, to]);
  const selectedCameraName = feedCameraId ? (camerasQ.data?.cameraMap?.[feedCameraId] ?? feedCameraId) : "";
  const typeLabel = feedType ? violationTypeLabel(feedType) : "All types";

  const [selected, setSelected] = useState<FeedRow | null>(null);
  const [imageMode, setImageMode] = useState<"scene" | "plate">("scene");
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [feedIdx, setFeedIdx] = useState(0);

  useEffect(() => {
    setPage(1);
    setFeedIdx(0);
    setSelected(null);
    setImageLoadFailed(false);
  }, [from, to, feedCameraId, feedType]);

  useEffect(() => {
    setImageLoadFailed(false);
  }, [selected?.id, imageMode]);

  const [ownerName, setOwnerName] = useState<string>("");
  const [ownerEmail, setOwnerEmail] = useState<string>("");
  const [ownerPhone, setOwnerPhone] = useState<string>("");
  const [ownerAddress, setOwnerAddress] = useState<string>("");

  const [plate, setPlate] = useState("");
  const [violationType, setViolationType] = useState<string>("WRONG_PARKING");
  const [amount, setAmount] = useState<number>(AMOUNTS.WRONG_PARKING);
  const [siteName, setSiteName] = useState<string>("");
  const [cameraId, setCameraId] = useState<string>("");
  const [detectedAt, setDetectedAt] = useState<string>("");
  const [proofUrl, setProofUrl] = useState<string>("");
  const [offenses, setOffenses] = useState<string[]>([]);
  const [othersText, setOthersText] = useState<string>("");
  const [accident, setAccident] = useState<"yes" | "no">("no");
  const [error, setError] = useState<string | null>(null);
  const [flashNotice, setFlashNotice] = useState<{ message: string; severity: "warning" | "success" | "error" } | null>(null);
  const [sendPhase, setSendPhase] = useState<"creating" | "sending" | null>(null);
  const [editingAmount, setEditingAmount] = useState(false);

  const toggleOffense = useCallback((code: string) => {
    setOffenses((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  }, []);
  const [sending, setSending] = useState(false);
  const [savingPlate, setSavingPlate] = useState(false);
  const [, setCreated] = useState<ChallanRow | null>(null);

  const feedQ = useQuery({
    queryKey: ["challan-feed", from, to, order, page, pageSize, feedCameraId, feedType],
    queryFn: async () => {
      const { data } = await api.get<{ rows: FeedRow[]; total: number; page: number; pageSize: number }>("/challan-public/violations-feed", {
        params: {
          ...(from && to ? { from, to } : {}),
          order,
          page,
          pageSize,
          ...(feedCameraId ? { cameraId: feedCameraId } : {}),
          ...(feedType ? { type: feedType } : {}),
        },
      });
      return data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 12_000,
  });

  const feedSummaryQ = useQuery({
    queryKey: ["challan-feed-summary", from, to, feedCameraId],
    queryFn: async () => {
      const { data } = await api.get<{ total: number; byType: Record<string, number> }>(
        "/challan-public/violations-feed-summary",
        { params: { ...(from && to ? { from, to } : {}), ...(feedCameraId ? { cameraId: feedCameraId } : {}) } }
      );
      return data;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 12_000,
  });

  const smtpQ = useQuery({
    queryKey: ["challan-smtp-status"],
    queryFn: async () => {
      const { data } = await api.get<{ configured: boolean; mode: string; from?: string }>("/challan-public/smtp-status");
      return data;
    },
    refetchInterval: 30_000,
  });

  const statsQ = useQuery({
    queryKey: ["ticket-stats-today", today],
    queryFn: async () => {
      const { data } = await api.get("/challan/stats", { params: { from: today, to: today } });
      return data as any;
    },
    placeholderData: keepPreviousData,
    refetchInterval: 12_000,
  });

  const loadOwnerForPlate = useCallback(async (plateValue: string) => {
    await api.get("/challan/resolve-owner", { params: { plate: plateValue } });
  }, []);

  const showFlash = useCallback((message: string, severity: "warning" | "success" | "error" = "warning") => {
    setFlashNotice({ message, severity });
  }, []);

  const submitPlate = useCallback(async () => {
    const p = plate.trim();
    if (!p) return;
    if (!isConfirmedPlate(p)) {
      showFlash("Enter a valid vehicle number before fetching owner details.");
      return;
    }
    setError(null);
    setSavingPlate(true);
    try {
      let savedPlate = p;
      if (selected?.id) {
        const { data } = await api.post<{ plate: string }>("/challan/confirm-plate", {
          violationId: selected.id,
          plate: p,
        });
        savedPlate = data.plate || p;
        setPlate(savedPlate);
        setSelected((row) => (row ? { ...row, plate: savedPlate } : row));
        await Promise.all([feedQ.refetch(), statsQ.refetch()]);
      }
      await loadOwnerForPlate(savedPlate);
    } catch (e: any) {
      const msg = e?.response?.data?.message;
      if (e?.response?.status === 503 || e?.response?.data?.error === "no_db") {
        showFlash("No DB connected.");
      } else {
        showFlash(String(msg || e?.message || "Failed to save vehicle number or fetch owner."));
      }
    } finally {
      setSavingPlate(false);
    }
  }, [feedQ, loadOwnerForPlate, plate, selected?.id, showFlash, statsQ]);

  useEffect(() => {
    if (!selected) return;
    const p = selected.plate || "";
    setPlate(p);
    setViolationType(String(selected.violationType || "").toUpperCase());
    const a = AMOUNTS[String(selected.violationType || "").toUpperCase()] ?? 1000;
    setAmount(a);
    setSiteName(selected.siteName || "");
    setCameraId(selected.cameraId || "");
    setDetectedAt(selected.detectedAt || "");
    setProofUrl(selected.sceneUrl || selected.plateUrl || "");
    setOffenses([]);
    setOthersText("");
    setAccident("no");
    setOwnerEmail("");
    setOwnerName("");
    setOwnerPhone("");
    setOwnerAddress("");
    setCreated(null);

  }, [selected]);

  useEffect(() => {
    const a = AMOUNTS[String(violationType || "").toUpperCase()] ?? amount;
    setAmount(a);

  }, [violationType]);

  const canSubmit = useMemo(() => {
    return Boolean(
      isConfirmedPlate(plate) &&
        ownerEmail.trim() &&
        amount > 0 &&
        detectedAt.trim() &&
        siteName.trim() &&
        offenses.length > 0 &&
        (!offenses.includes(OTHERS_CODE) || othersText.trim())
    );
  }, [plate, ownerEmail, amount, detectedAt, siteName, offenses, othersText]);

  const feedRows = feedQ.data?.rows || [];
  const feedTotal = Number(feedQ.data?.total || 0);

  const applyFeedSelection = useCallback((rows: FeedRow[], idx: number) => {
    if (!rows.length) {
      setFeedIdx(0);
      setSelected(null);
      return;
    }
    const clamped = Math.min(Math.max(idx, 0), rows.length - 1);
    setFeedIdx(clamped);
    setSelected(rows[clamped] ?? null);
  }, []);

  const advanceAfterProcessed = useCallback(
    async (processedViolationId?: number) => {
      const idxBefore = feedIdx;
      const feedResult = await feedQ.refetch();
      await statsQ.refetch();
      const rows = feedResult.data?.rows || [];
      const total = Number(feedResult.data?.total || 0);
      const pageCount = Math.max(1, Math.ceil(total / pageSize));

      if (!rows.length) {
        if (page < pageCount) {
          setPage((p) => p + 1);
          setFeedIdx(0);
          setSelected(null);
        } else {
          applyFeedSelection([], 0);
        }
        return;
      }

      const stillIdx =
        processedViolationId != null ? rows.findIndex((r) => r.id === processedViolationId) : -1;

      if (stillIdx >= 0) {
        if (stillIdx < rows.length - 1) {
          applyFeedSelection(rows, stillIdx + 1);
        } else if (page < pageCount) {
          setPage((p) => p + 1);
          setFeedIdx(0);
          setSelected(null);
        } else {
          applyFeedSelection(rows, stillIdx);
        }
        return;
      }

      applyFeedSelection(rows, Math.min(idxBefore, rows.length - 1));
    },
    [applyFeedSelection, feedIdx, feedQ, page, pageSize, statsQ]
  );

  const createAndSend = useCallback(async () => {
    setError(null);
    setSending(true);
    setSendPhase("creating");
    try {
      const { data } = await api.post<{ challan: ChallanRow }>("/challan/create", {
        violationId: selected?.id ?? null,
        plate,
        violationType,
        amount,
        siteName: siteName || null,
        cameraId: cameraId || null,
        detectedAt: detectedAt || null,
        proofUrl: proofUrl || null,
        offenses,
        othersText: othersText || null,
        accident,
        ownerName: ownerName || null,
        ownerEmail: ownerEmail || null,
        ownerPhone: ownerPhone || null,
        ownerAddress: ownerAddress || null,
        source: "auto",
      });
      setCreated(data.challan);
      setSendPhase("sending");
      const { data: send } = await api.post<{ challan: ChallanRow; send?: { mode?: string } }>(`/challan/send/${data.challan.id}`);
      setCreated(send.challan);

      const ticketNo = `MTMDO-${String(send.challan.id).padStart(5, "0")}`;
      showFlash(`Ticket ${ticketNo} issued and email sent to ${ownerEmail.trim()}.`, "success");
      await advanceAfterProcessed(selected?.id);
    } catch (e: any) {
      const msg = String(e?.response?.data?.message || e?.message || "Failed to send violation ticket.");
      setError(msg);
      showFlash(msg, "error");
    } finally {
      setSending(false);
      setSendPhase(null);
    }
  }, [advanceAfterProcessed, accident, amount, cameraId, detectedAt, offenses, othersText, ownerAddress, ownerEmail, ownerName, ownerPhone, plate, proofUrl, selected?.id, showFlash, siteName, violationType]);

  useEffect(() => {
    if (!feedRows.length) {
      if (selected != null) setSelected(null);
      return;
    }
    let idx = feedIdx;
    if (idx < 0) idx = 0;
    if (idx >= feedRows.length) idx = feedRows.length - 1;
    if (idx !== feedIdx) {
      setFeedIdx(idx);
      return;
    }
    const row = feedRows[idx];
    if (row?.id !== selected?.id) setSelected(row ?? null);
  }, [feedIdx, feedRows, selected]);

  const markInvalid = useCallback(async () => {
    if (!selected?.id) return;
    setError(null);
    try {
      await api.post(`/dashboard/violations/${selected.id}/feedback`, { feedback: 0 });
      await api.post("/challan/flag", { violationId: selected.id, flag: 0 });
      await advanceAfterProcessed(selected.id);
    } catch (e: any) {
      setError(String(e?.response?.data?.message || e?.message || "Failed to mark invalid."));
    }
  }, [advanceAfterProcessed, selected?.id]);

  const advanceViolation = useCallback(() => {
    if (!feedRows.length) return;
    const pageCount = Math.max(1, Math.ceil(feedTotal / pageSize));
    if (feedIdx < feedRows.length - 1) {
      setFeedIdx((v) => v + 1);
      return;
    }
    if (page < pageCount) {
      setPage((p) => p + 1);
      setFeedIdx(0);
      return;
    }
    setFeedIdx(0);
  }, [feedIdx, feedRows.length, feedTotal, page, pageSize]);

  const donutData = useMemo(() => {
    const generated = Number(statsQ.data?.generated ?? 0);
    const invalid = Number(statsQ.data?.invalid ?? 0);
    const pending = Number(statsQ.data?.pending ?? 0);
    const failed = Number(statsQ.data?.failed ?? 0);
    const total = Math.max(0, generated + invalid + pending + failed);
    const safeTotal = total > 0 ? total : 1;
    return {
      total,
      series: [
        { name: "Generated", value: generated, color: "#2563EB" },
        { name: "Invalid", value: invalid, color: "#64748B" },
        { name: "Pending", value: pending, color: "#F59E0B" },
        { name: "Failed", value: failed, color: "#DC2626" },
      ].filter((s) => s.value > 0),
      pctGenerated: Math.round((generated / safeTotal) * 100),
    };
  }, [statsQ.data?.failed, statsQ.data?.generated, statsQ.data?.invalid, statsQ.data?.pending]);

  const autoPanel = (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: `${gridCols(12)}` }, gap: 2 }}>
      <Paper sx={{ ...contentCardSx, gridColumn: { xs: "1 / -1", lg: "span 12" } }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(12, minmax(0, 1fr))" }, gap: 2 }}>
          {}
          <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 4" } }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, mb: 1 }}>
              <Typography sx={{ fontWeight: 800, fontSize: "0.875rem" }}>
                Violation{" "}
                {feedTotal
                  ? `${(page - 1) * pageSize + feedIdx + 1} of ${feedTotal}`
                  : feedRows.length
                    ? `${feedIdx + 1} of ${feedRows.length}`
                    : "—"}
              </Typography>
              <Box>
                <IconButton size="small" onClick={() => setFeedIdx((v) => Math.max(0, v - 1))} disabled={!feedRows.length}>
                  <ChevronLeftIcon fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={() => advanceViolation()} disabled={!feedRows.length}>
                  <ChevronRightIcon fontSize="small" />
                </IconButton>
              </Box>
            </Box>

            <Box sx={{ borderRadius: 3, overflow: "hidden", border: "1px solid rgba(15,23,42,0.12)", bgcolor: "#0B1220", boxShadow: "0 18px 48px rgba(2,6,23,0.10)" }}>
              {feedQ.isError ? (
                <Box sx={{ p: 1.25, bgcolor: "#111827" }}>
                  <Alert severity="error">
                    Failed to load live violations feed. {String((feedQ.error as any)?.response?.data?.message || (feedQ.error as any)?.message || "")}
                  </Alert>
                </Box>
              ) : null}
              {(() => {
                const src =
                  imageMode === "plate"
                    ? selected?.plateUrl || selected?.sceneUrl || ""
                    : selected?.sceneUrl || selected?.plateUrl || "";
                const finalSrc = imgUrl(src);
                if (!finalSrc || imageLoadFailed) {
                  return (
                    <Box
                      sx={{
                        height: 260,
                        display: "grid",
                        placeItems: "center",
                        color: "rgba(226,232,240,0.82)",
                        bgcolor: "#111827",
                        px: 2,
                        textAlign: "center",
                      }}
                    >
                      <Box>
                        <Typography sx={{ fontWeight: 900, fontSize: "0.95rem" }}>
                          {feedRows.length
                            ? imageLoadFailed
                              ? "Image file not found on server"
                              : "No image available"
                            : feedQ.isLoading
                              ? "Loading…"
                              : "No violations returned"}
                        </Typography>
                        <Typography sx={{ fontSize: "0.75rem", color: "rgba(148,163,184,0.9)", mt: 0.5 }}>
                          {feedRows.length
                            ? imageLoadFailed
                              ? "The violation record exists, but the scene/plate file is missing from /receiver-results. The inference sender may not be uploading image bytes."
                              : `This violation record does not have a stored ${imageMode === "plate" ? "plate crop" : "scene capture"} URL.`
                            : "The API returned zero rows for the current feed query."}
                        </Typography>
                      </Box>
                    </Box>
                  );
                }
                return (
                  <Box sx={{ position: "relative" }}>
                    <Box
                      component="img"
                      alt=""
                      src={finalSrc}
                      onError={() => setImageLoadFailed(true)}
                      sx={{
                        width: "100%",
                        height: 260,
                        objectFit: imageMode === "scene" ? "cover" : "contain",
                        bgcolor: "#111827",
                        display: "block",
                      }}
                    />
                    {}
                    <Box sx={{ position: "absolute", left: 18, right: 18, top: 10, display: "flex", gap: 1, alignItems: "center" }}>
                      <Chip
                        size="small"
                        icon={<AccessTimeOutlinedIcon sx={{ color: "rgba(248,250,252,0.92)" }} />}
                        label={`Captured: ${selected?.detectedAt || "—"}`}
                        sx={{ ...kpiChipSx(), minWidth: 0 }}
                      />
                      <Box sx={{ flex: 1 }} />
                      <Chip
                        size="small"
                        icon={<PlaceOutlinedIcon sx={{ color: "rgba(248,250,252,0.92)" }} />}
                        label={selected?.siteName || "—"}
                        sx={{ ...kpiChipSx(), flexShrink: 0, maxWidth: "55%" }}
                      />
                    </Box>

                    {}
                    {selected?.sceneUrl && selected?.plateUrl ? (
                      <IconButton
                        onClick={() => setImageMode((m) => (m === "scene" ? "plate" : "scene"))}
                        size="small"
                        title={imageMode === "scene" ? "Show plate crop" : "Show scene"}
                        sx={{
                          position: "absolute",
                          bottom: 10,
                          right: 10,
                          zIndex: 20,
                          width: 36,
                          height: 36,
                          borderRadius: 2,
                          border: "1px solid rgba(148,163,184,0.35)",
                          bgcolor: "rgba(15,23,42,0.55)",
                          color: "#E2E8F0",
                          "&:hover": { bgcolor: "rgba(15,23,42,0.75)" },
                        }}
                      >
                        <FlipIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    ) : null}

                    <Box
                      sx={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: 0,
                        height: 64,
                        background: "linear-gradient(180deg, transparent, rgba(2,6,23,0.68))",
                        pointerEvents: "none",
                      }}
                    />
                  </Box>
                );
              })()}
            </Box>

            {}
            <Box sx={{ mt: 1.25, p: 1.5, borderRadius: 3, border: "1px solid rgba(15,23,42,0.10)", bgcolor: "rgba(255,255,255,0.92)" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 1.25, alignItems: "start" }}>
                <Box>
                  <Typography
                    sx={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
                      fontWeight: 900,
                      fontSize: "1.1rem",
                      letterSpacing: "-0.02em",
                      color: "rgba(15,23,42,0.92)",
                    }}
                  >
                    {isConfirmedPlate(plate) ? plate : "NOT INFERRED"}
                  </Typography>
                  <Chip
                    size="small"
                    label={isConfirmedPlate(plate) ? "CONFIRMED" : "PENDING"}
                    color={isConfirmedPlate(plate) ? "success" : "default"}
                    variant={isConfirmedPlate(plate) ? "filled" : "outlined"}
                    sx={{ mt: 0.75, fontWeight: 800 }}
                  />
                </Box>
                <Box sx={{ display: "grid", gap: 0.75 }}>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, fontWeight: 800 }}>Detected At</Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "rgba(15,23,42,0.86)", fontWeight: 900, textAlign: "right" }}>{detectedAt || "—"}</Typography>
                  </Box>
                  <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                    <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, fontWeight: 800 }}>Location</Typography>
                    <Typography sx={{ fontSize: "0.75rem", color: "rgba(15,23,42,0.86)", fontWeight: 900, textAlign: "right" }}>{siteName || selected?.siteName || "—"}</Typography>
                  </Box>
                </Box>
              </Box>

              <Box sx={{ mt: 1.25, pt: 1.25, borderTop: "1px solid rgba(15,23,42,0.08)", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1 }}>
                <Box>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 900, letterSpacing: "0.12em", color: "rgba(100,116,139,0.95)", textTransform: "uppercase" }}>
                    Violation Type
                  </Typography>
                  <Typography sx={{ mt: 0.3, fontSize: "0.875rem", fontWeight: 900, color: "rgba(15,23,42,0.90)" }}>{violationTypeLabel(violationType)}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 900, letterSpacing: "0.12em", color: "rgba(100,116,139,0.95)", textTransform: "uppercase" }}>
                    Amount
                  </Typography>
                  {editingAmount ? (
                    <TextField
                      size="small"
                      autoFocus
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value || 0))}
                      onBlur={() => setEditingAmount(false)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === "Escape") setEditingAmount(false);
                      }}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₱</InputAdornment> } }}
                      sx={{ mt: 0.3, maxWidth: 120, "& .MuiInputBase-input": { py: 0.5, fontSize: "0.875rem", fontWeight: 900 } }}
                    />
                  ) : (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                      <Typography sx={{ mt: 0.3, fontSize: "0.875rem", fontWeight: 900, color: "rgba(15,23,42,0.90)" }}>{money(amount)}</Typography>
                      <IconButton size="small" title="Edit amount" onClick={() => setEditingAmount(true)} sx={{ p: 0.25, color: "#2563EB" }}>
                        <EditOutlinedIcon sx={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  )}
                </Box>
                <Box>
                  <Typography sx={{ fontSize: "0.6875rem", fontWeight: 900, letterSpacing: "0.12em", color: "rgba(100,116,139,0.95)", textTransform: "uppercase" }}>
                    Status
                  </Typography>
                  <Chip size="small" label="Pending" sx={{ mt: 0.55, fontWeight: 900, bgcolor: "rgba(245,158,11,0.14)", color: "rgba(124,45,18,0.9)" }} />
                </Box>
              </Box>

              <Box sx={{ mt: 1.25, display: "grid", gridTemplateColumns: "1fr", gap: 1 }}>
                <Button
                  variant="contained"
                  fullWidth
                  disabled={!feedRows.length}
                  onClick={() => advanceViolation()}
                  startIcon={<AutorenewOutlinedIcon sx={{ color: "#fff" }} />}
                  sx={primaryActionBtnSx}
                >
                  Skip This Violation
                </Button>
                <Button
                  variant="outlined"
                  fullWidth
                  color="error"
                  disabled={!selected?.id}
                  onClick={() => void markInvalid()}
                  sx={{ borderRadius: 2, py: 1.05, fontWeight: 900 }}
                >
                  Mark Invalid
                </Button>
              </Box>
            </Box>

            <Typography sx={{ ...sectionTitleSx, mt: 2 }}>Recent Activity</Typography>
            <Box sx={sectionCardSx}>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }}>Latest tickets</Typography>
                <Button size="small" onClick={() => setPageTab("history")} sx={{ fontSize: "0.75rem", fontWeight: 800, minWidth: 0, p: 0 }}>
                  View all
                </Button>
              </Box>
              <Stack spacing={1}>
                {(statsQ.data?.recent || []).slice(0, 5).map((r: any) => {
                  const violationId = Number(r.violationId);
                  const canOpen = Number.isFinite(violationId) && violationId > 0;
                  const openViolation = () => {
                    if (!canOpen) return;
                    navigate(
                      violationEventPath({
                        violationId,
                        violationType: r.violationType,
                        plate: r.plate,
                        detectedAt: r.detectedAt,
                      })
                    );
                  };
                  return (
                    <Box
                      key={r.violationId ?? r.id}
                      role={canOpen ? "button" : undefined}
                      tabIndex={canOpen ? 0 : undefined}
                      onClick={canOpen ? openViolation : undefined}
                      onKeyDown={
                        canOpen
                          ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                openViolation();
                              }
                            }
                          : undefined
                      }
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 1,
                        alignItems: "center",
                        p: 1,
                        borderRadius: 2,
                        bgcolor: "rgba(15,23,42,0.03)",
                        cursor: canOpen ? "pointer" : "default",
                        transition: "background 0.15s ease, box-shadow 0.15s ease",
                        "&:hover": canOpen ? { bgcolor: "rgba(37,99,235,0.08)", boxShadow: "0 0 0 1px rgba(37,99,235,0.2)" } : undefined,
                      }}
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: "0.8125rem" }}>{r.plate || "—"}</Typography>
                        <Typography sx={{ fontSize: "0.6875rem", color: pnp.textSecondary }}>
                          {violationTypeLabel(r.violationType)}
                          {r.detectedAt ? ` · ${r.detectedAt}` : ""}
                        </Typography>
                      </Box>
                      <Chip
                        size="small"
                        icon={<VisibilityOutlinedIcon />}
                        label={r.status === "generated" ? "Generated" : r.status === "invalid" ? "Invalid" : String(r.status || "—")}
                        color={r.status === "generated" ? "success" : r.status === "invalid" ? "default" : "default"}
                        variant="filled"
                        onClick={(e) => {
                          e.stopPropagation();
                          openViolation();
                        }}
                        sx={{ fontWeight: 800 }}
                      />
                    </Box>
                  );
                })}
                {!statsQ.data?.recent?.length ? (
                  <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }}>No recent tickets yet.</Typography>
                ) : null}
              </Stack>
            </Box>
          </Box>

          {}
          <Box sx={{ gridColumn: { xs: "1 / -1", lg: "span 8" } }}>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", lg: "repeat(8, minmax(0, 1fr))" }, gap: 2 }}>
          <Box sx={{ gridColumn: { xs: "1 / -1", lg: "1 / 6" }, gridRow: { lg: 1 }, display: "flex", flexDirection: "column" }}>
            <Typography sx={sectionTitleSx}>Vehicle &amp; Owner Details</Typography>
            <Box sx={{ ...sectionCardSx, flex: 1, display: "flex", flexDirection: "column" }}>
              <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 1.75, flex: 1, alignContent: "space-between" }}>
                <TextField
                  label="Vehicle Number"
                  fullWidth
                  value={plate}
                  onChange={(e) => setPlate(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && plate.trim() && !savingPlate) void submitPlate();
                  }}
                />
                <TextField label="Owner Name" fullWidth value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                <TextField label="Email" fullWidth value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} sx={{ gridColumn: "1 / -1" }} />
                <TextField label="Phone" fullWidth value={ownerPhone} onChange={(e) => setOwnerPhone(e.target.value)} sx={{ gridColumn: "1 / -1" }} />
                <TextField label="Address" fullWidth value={ownerAddress} onChange={(e) => setOwnerAddress(e.target.value)} sx={{ gridColumn: "1 / -1" }} />
              </Box>
              <Box sx={{ mt: 1.5, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                <Chip
                  size="small"
                  icon={<CheckCircleOutlinedIcon />}
                  label={ownerEmail.trim() ? "Owner details entered" : "Enter owner details manually"}
                  color={ownerEmail.trim() ? "success" : "default"}
                  variant={ownerEmail.trim() ? "filled" : "outlined"}
                  sx={{ fontWeight: 800 }}
                />
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => void submitPlate()}
                  disabled={!isConfirmedPlate(plate) || savingPlate}
                  sx={{ borderRadius: 2, fontWeight: 800, textTransform: "none" }}
                >
                  {savingPlate ? "Fetching…" : "Fetch owner details"}
                </Button>
              </Box>
            </Box>

          </Box>

          <Box sx={{ gridColumn: "1 / -1", gridRow: { lg: 2 } }}>
            <Typography sx={sectionTitleSx}>Issue Ticket</Typography>
            <Box sx={sectionCardSx}>
              <Typography sx={{ mb: 1, fontSize: "0.8125rem", fontWeight: 800, color: "rgba(15,23,42,0.8)" }}>
                Violation Type / Offense(s){" "}
                <Box component="span" sx={{ color: "#dc2626" }}>*</Box>
              </Typography>
              <Box
                sx={{
                  p: 1,
                  borderRadius: 2,
                  bgcolor: "rgba(15,23,42,0.02)",
                  border: "1px solid rgba(15,23,42,0.07)",
                  display: "grid",
                  gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", md: "repeat(3, minmax(0, 1fr))" },
                  columnGap: 1.5,
                  rowGap: 0.25,
                  alignItems: "start",
                }}
              >
                {TCT_OFFENSES.map((o) => {
                  const checked = offenses.includes(o.code);
                  return (
                    <FormControlLabel
                      key={o.code}
                      checked={checked}
                      onChange={() => toggleOffense(o.code)}
                      control={<Checkbox size="small" sx={{ p: 0.75, alignSelf: "flex-start" }} />}
                      label={o.label}
                      sx={{
                        m: 0,
                        alignItems: "flex-start",
                        borderRadius: 1.5,
                        pr: 1,
                        transition: "background 0.12s ease",
                        bgcolor: checked ? "rgba(37,99,235,0.08)" : "transparent",
                        "&:hover": { bgcolor: checked ? "rgba(37,99,235,0.12)" : "rgba(15,23,42,0.035)" },
                        "& .MuiFormControlLabel-label": {
                          fontSize: "0.8125rem",
                          lineHeight: 1.35,
                          pt: "6px",
                          color: checked ? "rgba(15,23,42,0.95)" : "rgba(15,23,42,0.8)",
                          fontWeight: checked ? 700 : 500,
                        },
                      }}
                    />
                  );
                })}
              </Box>

              <Box sx={{ mt: 1.5, display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5, alignItems: "start" }}>
                <TextField
                  label="Others Specify"
                  placeholder="Enter details if 'Others' is selected"
                  fullWidth
                  multiline
                  minRows={2}
                  value={othersText}
                  onChange={(e) => setOthersText(e.target.value)}
                  disabled={!offenses.includes(OTHERS_CODE)}
                />

                <Box>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                    <Typography sx={{ fontSize: "0.8125rem", fontWeight: 800 }}>Accident:</Typography>
                    <RadioGroup row value={accident} onChange={(e) => setAccident(e.target.value as "yes" | "no")}>
                      <FormControlLabel value="yes" control={<Radio size="small" />} label="Yes" />
                      <FormControlLabel value="no" control={<Radio size="small" />} label="No" />
                    </RadioGroup>
                  </Box>

                  {sendPhase ? (
                    <Alert severity="info" icon={<CircularProgress size={16} color="inherit" />} sx={{ mb: 1 }}>
                      {sendPhase === "creating" ? "Creating ticket…" : "Sending violation email…"}
                    </Alert>
                  ) : null}

                  {error ? <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert> : null}
                  <Button
                    variant="contained"
                    fullWidth
                    startIcon={sending ? <CircularProgress size={18} color="inherit" /> : <LocalPoliceOutlinedIcon />}
                    disabled={!canSubmit || sending}
                    onClick={() => void createAndSend()}
                    sx={{ ...primaryActionBtnSx, mt: 0.5 }}
                  >
                    {sendPhase === "creating"
                      ? "Creating ticket…"
                      : sendPhase === "sending"
                        ? "Sending email…"
                        : "Issue Ticket & Notify Owner"}
                  </Button>
                </Box>
              </Box>
            </Box>
          </Box>

          {}
          <Box sx={{ gridColumn: { xs: "1 / -1", lg: "6 / -1" }, gridRow: { lg: 1 }, display: "flex", flexDirection: "column" }}>
            <Typography sx={sectionTitleSx}>Ticket Stats (Today)</Typography>
            <Box sx={{ ...sectionCardSx, flex: 1 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 1 }}>
                {[
                  { label: "Generated", value: statsQ.data?.generated ?? 0 },
                  { label: "Invalid", value: statsQ.data?.invalid ?? 0 },
                  { label: "Pending", value: statsQ.data?.pending ?? 0 },
                  { label: "Failed", value: statsQ.data?.failed ?? 0 },
                ].map((k) => (
                  <Box
                    key={k.label}
                    sx={{
                      textAlign: "center",
                      p: 1.25,
                      minWidth: 0,
                      borderRadius: 2,
                      bgcolor: "rgba(15,23,42,0.03)",
                      border: "1px solid rgba(15, 23, 42, 0.06)",
                    }}
                  >
                    <Typography sx={{ fontWeight: 900, fontSize: "1.125rem", lineHeight: 1.2 }}>{k.value}</Typography>
                    <Typography
                      sx={{
                        fontSize: "0.6875rem",
                        color: pnp.textSecondary,
                        fontWeight: 700,
                        mt: 0.35,
                        lineHeight: 1.2,
                        wordBreak: "keep-all",
                      }}
                    >
                      {k.label}
                    </Typography>
                  </Box>
                ))}
              </Box>

              <Box sx={{ mt: 1.5, height: 124 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData.series.length ? donutData.series : [{ name: "No data", value: 1, color: "rgba(148,163,184,0.35)" }]}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={40}
                      outerRadius={56}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {(donutData.series.length ? donutData.series : [{ name: "No data", value: 1, color: "rgba(148,163,184,0.35)" }]).map((entry, idx) => (
                        <Cell key={idx} fill={(entry as any).color} stroke="rgba(255,255,255,0.75)" strokeWidth={1} />
                      ))}
                    </Pie>
                    <ReTooltip />
                  </PieChart>
                </ResponsiveContainer>
                <Box sx={{ mt: -9.25, textAlign: "center", pointerEvents: "none" }}>
                  <Typography sx={{ fontWeight: 900, fontSize: "1.25rem", lineHeight: 1 }}>{donutData.total ? `${donutData.pctGenerated}%` : "—"}</Typography>
                </Box>
              </Box>

              <Box sx={{ mt: 1.25, display: "flex", justifyContent: "space-between" }}>
                <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary }}>Total Amount</Typography>
                <Typography sx={{ fontWeight: 900 }}>{money(statsQ.data?.amount ?? 0)}</Typography>
              </Box>
              <Box sx={{ mt: 1 }}>
                <Link href="/violations" underline="none" sx={{ fontSize: "0.75rem", fontWeight: 800 }}>
                  View full report →
                </Link>
              </Box>
            </Box>
          </Box>
            </Box>
          </Box>
        </Box>
      </Paper>

    </Box>
  );

  const alreadyToday = from === today && to === today;
  const feedByType = feedSummaryQ.data?.byType;
  const feedSummaryTotal = feedSummaryQ.data?.total ?? 0;
  const typesByCount = violationTypesByCount(feedByType);

  const filterSummaryChip = (
    <Chip
      icon={<PolicyIcon />}
      label={`${feedType ? typeLabel : "All types"}${selectedCameraName ? ` · ${selectedCameraName}` : ""} · ${spanDays} day${spanDays === 1 ? "" : "s"}`}
      color="primary"
      variant="outlined"
      sx={{
        fontWeight: 600,
        textTransform: "none",
        bgcolor: "rgba(29,78,216,0.06)",
        borderRadius: 1.5,
        flexShrink: 0,
      }}
    />
  );

  const filterPanel = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.75, mb: 2 }}>
      <Paper elevation={0} sx={{ ...contentCardSx, p: { xs: 2, sm: 2.25 } }}>
        <Box
          sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", sm: gridCols(2), lg: gridCols(4) },
          gap: 2,
          alignItems: "end",
        }}
      >
        <DatePicker
          label={SITE_LABELS.reportingStart}
          format="YYYY-MM-DD"
          value={dayjsInSite(from)}
          onChange={(v) => {
            if (v?.isValid()) setFrom(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
          }}
          maxDate={dayjsInSite(to)}
          slotProps={{ textField: filterRowTextFieldSlotProps }}
        />
        <DatePicker
          label={SITE_LABELS.reportingEnd}
          format="YYYY-MM-DD"
          value={dayjsInSite(to)}
          onChange={(v) => {
            if (v?.isValid()) setTo(v.tz(SITE_TIMEZONE).format("YYYY-MM-DD"));
          }}
          minDate={dayjsInSite(from)}
          slotProps={{ textField: filterRowTextFieldSlotProps }}
        />
        <TextField
          select
          label="Camera site"
          value={feedCameraId}
          onChange={(e) => setFeedCameraId(e.target.value)}
          {...filterRowTextFieldSlotProps}
        >
          <MenuItem value="">All camera sites</MenuItem>
          {cameraFilterOptions.map(({ id, name }) => (
            <MenuItem key={id} value={id}>
              {name}
            </MenuItem>
          ))}
        </TextField>
        <Button
          fullWidth
          variant="contained"
          disableElevation
          disabled={alreadyToday}
          startIcon={<BoltIcon sx={{ fontSize: 18 }} />}
          onClick={() => {
            const d = defaultTodayRange();
            setFrom(d.from);
            setTo(d.to);
            setFeedType("");
            setFeedCameraId("");
          }}
          sx={filterRowJumpToTodaySx(alreadyToday)}
        >
          {SITE_LABELS.jumpToToday}
        </Button>
      </Box>

      <Box sx={{ mt: 2, display: "flex", flexWrap: "wrap", gap: 1 }}>
        <Chip
          label={`All · ${feedSummaryTotal.toLocaleString()}`}
          onClick={() => setFeedType("")}
          color={!feedType ? "primary" : "default"}
          variant={!feedType ? "filled" : "outlined"}
          sx={{ fontWeight: 900, cursor: "pointer" }}
        />
        {typesByCount.map((t) => {
          const meta = VIOLATION_TYPE_META[t];
          const selected = feedType === t;
          if (!meta) return null;
          const count = feedByType?.[t] ?? 0;
          return (
            <Chip
              key={t}
              icon={<meta.Icon sx={{ fontSize: "16px !important" }} />}
              label={`${meta.label} · ${feedSummaryQ.isLoading ? "-" : count.toLocaleString()}`}
              onClick={() => setFeedType(selected ? "" : t)}
              variant={selected ? "filled" : "outlined"}
              sx={{
                fontWeight: 900,
                cursor: "pointer",
                bgcolor: selected ? meta.softBg : undefined,
                color: selected ? meta.color : undefined,
                borderColor: selected ? meta.color : undefined,
              }}
            />
          );
        })}
      </Box>
    </Paper>
    </Box>
  );

  return (
    <Box sx={pageLayoutSx}>
      <Snackbar
        open={Boolean(flashNotice)}
        autoHideDuration={5000}
        onClose={() => setFlashNotice(null)}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ top: { xs: 72, sm: 80 } }}
      >
        <Alert
          severity={flashNotice?.severity || "warning"}
          variant="filled"
          onClose={() => setFlashNotice(null)}
          sx={{ width: "100%", fontWeight: 700 }}
        >
          {flashNotice?.message}
        </Alert>
      </Snackbar>

      {sendPhase ? <LinearProgress sx={{ mb: 1.5, borderRadius: 999 }} /> : null}

      {smtpQ.data && !smtpQ.data.configured && pageTab === "create" ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Email is not active (demo mode). Add your Google App Password to{" "}
          <strong>/home/aiserver/mern-vsp/server/smtp.env</strong> on the <code>SMTP_PASS=</code> line, then restart the API.
          Tickets will not reach owners until this is done.
        </Alert>
      ) : null}

      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: { xs: 1.5, sm: 2 },
          mb: 2,
          flexWrap: { xs: "wrap", lg: "nowrap" },
        }}
      >
        <Box
          sx={{
            flex: { xs: "1 1 100%", lg: "1 1 auto" },
            display: "flex",
            justifyContent: "center",
            minWidth: 0,
          }}
        >
          <Box sx={{ width: "100%", maxWidth: { xs: "100%", sm: 720 }, minWidth: { sm: 420 } }}>
            <SegmentTabBar
              active={pageTab}
              onChange={setPageTab}
              ariaLabel="Ticket management"
              maxWidth="100%"
              sx={{ width: "100%" }}
              tabs={[
                {
                  id: "create",
                  label: "Generate Ticket",
                  icon: <ReceiptLongOutlinedIcon sx={{ fontSize: 16 }} />,
                },
                {
                  id: "history",
                  label: "Ticket History",
                  icon: <HistoryOutlinedIcon sx={{ fontSize: 16 }} />,
                },
              ]}
            />
          </Box>
        </Box>
        <Box sx={{ display: "flex", justifyContent: { xs: "flex-end", lg: "flex-end" }, minWidth: 0, flexShrink: 0, width: { xs: "100%", lg: "auto" } }}>
          {pageTab === "create" ? filterSummaryChip : null}
        </Box>
      </Box>

      {pageTab === "create" && filterPanel}
      {pageTab === "create" ? autoPanel : <ChallanHistoryPanel />}
    </Box>
  );
}

