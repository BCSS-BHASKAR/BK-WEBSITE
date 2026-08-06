import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  IconButton,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import { ChallanPdfModal } from "./ChallanPdfModal";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import PendingOutlinedIcon from "@mui/icons-material/PendingOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import { api } from "../../lib/api";
import { contentCardSx } from "../../lib/uiSurfaces";
import { pnp } from "../../lib/pnpTheme";
import { violationTypeLabel, violationTypeMeta } from "../../lib/violationTypes";
import { ymdSite } from "../../lib/siteTimeZone";
import { ImageZoomDialog, type ImageZoomPayload } from "../ImageZoomDialog";
import { zoomPayloadFromViolationRow } from "../../lib/eventImageZoom";
import type { ViolationEventRow } from "../ViolationEventCard";
import { receiverImageUrl } from "../../lib/receiverImageUrl";
import { defaultTodayRange } from "../../lib/dashboardRange";

export type ChallanHistoryRow = {
  id: number;
  plate: string;
  violationType: string;
  amount: number;
  siteName: string | null;
  cameraId?: string | null;
  detectedAt?: string | null;
  ownerEmail: string;
  ownerName?: string | null;
  status: string;
  paymentStatus?: string;
  violationId?: number | null;
  proofUrl?: string | null;
  createdAt: string;
  pdfS3Key?: string | null;
};

const PAGE_SIZE = 10;

function money(n: number) {
  return `₱ ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function paymentBucket(row: ChallanHistoryRow): "paid" | "unpaid" | "overdue" {
  const ps = String(row.paymentStatus || "unpaid").toLowerCase();
  if (ps === "paid") return "paid";
  if (ps === "overdue") return "overdue";
  const d = String(row.detectedAt || row.createdAt || "").slice(0, 10);
  if (d) {
    const due = new Date(d);
    due.setDate(due.getDate() + 30);
    if (due < new Date()) return "overdue";
  }
  return "unpaid";
}

function violationChip(code: string) {
  const meta = violationTypeMeta(code);
  const label = violationTypeLabel(code);
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        fontWeight: 800,
        maxWidth: "100%",
        bgcolor: meta?.softBg || "rgba(15,23,42,0.06)",
        color: meta?.color || "#334155",
        border: `1px solid ${meta?.color || "#cbd5e1"}33`,
        "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" },
      }}
    />
  );
}

function statusChip(status: string) {
  const s = String(status || "draft").toLowerCase();
  const icon = s === "sent" ? <CheckCircleOutlinedIcon /> : s === "failed" ? <ErrorOutlineOutlinedIcon /> : <PendingOutlinedIcon />;
  return (
    <Chip
      size="small"
      icon={icon}
      label={s === "sent" ? "Sent" : s === "failed" ? "Failed" : "Draft"}
      color={s === "sent" ? "success" : s === "failed" ? "error" : "default"}
      variant={s === "draft" ? "outlined" : "filled"}
      sx={{ fontWeight: 800, textTransform: "capitalize" }}
    />
  );
}

function paymentChip(row: ChallanHistoryRow) {
  const bucket = paymentBucket(row);
  const color = bucket === "paid" ? "success" : bucket === "overdue" ? "error" : "warning";
  const label = bucket === "paid" ? "Paid" : bucket === "overdue" ? "Overdue" : "Unpaid";
  return <Chip size="small" label={label} color={color} variant="filled" sx={{ fontWeight: 800 }} />;
}

const VIOLATION_FILTER_OPTIONS = ["", "NO_HELMET", "WRONG_PARKING", "WRONG_ROUTE", "TRIPLE_RIDING"];

const cellSx = {
  fontSize: "0.8125rem",
  py: 1.25,
  px: 1,
  borderBottom: "1px solid rgba(15,23,42,0.06)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
} as const;

const headSx = {
  fontWeight: 900,
  fontSize: "0.6875rem",
  letterSpacing: "0.06em",
  py: 1,
  px: 1,
  bgcolor: "rgba(248,250,252,0.95)",
  borderBottom: "1px solid rgba(15,23,42,0.10)",
  whiteSpace: "nowrap",
} as const;

export function ChallanHistoryPanel() {
  const today = ymdSite();
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [plate, setPlate] = useState("");
  const [violationType, setViolationType] = useState("");
  const [siteName, setSiteName] = useState("");
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState<ImageZoomPayload | null>(null);
  const [zoomLoadingId, setZoomLoadingId] = useState<number | null>(null);
  const [zoomError, setZoomError] = useState<string | null>(null);
  const [pdfRow, setPdfRow] = useState<ChallanHistoryRow | null>(null);

  const historyQ = useQuery({
    queryKey: ["challan-history", from, to, plate, violationType, siteName, status, paymentStatus],
    queryFn: async () => {
      const { data } = await api.get<{ rows: ChallanHistoryRow[] }>("/challan/history", {
        params: { from, to, plate, violationType, siteName, status },
      });
      let rows = data.rows || [];
      if (paymentStatus) {
        rows = rows.filter((r) => paymentBucket(r) === paymentStatus);
      }
      return rows;
    },
    placeholderData: keepPreviousData,
  });

  const rows = historyQ.data || [];

  useEffect(() => {
    setPage(1);
  }, [from, to, plate, violationType, siteName, status, paymentStatus]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const summary = useMemo(() => {
    const total = rows.length;
    const paid = rows.filter((r) => paymentBucket(r) === "paid").length;
    const unpaid = rows.filter((r) => paymentBucket(r) === "unpaid").length;
    const overdue = rows.filter((r) => paymentBucket(r) === "overdue").length;
    return { total, paid, unpaid, overdue };
  }, [rows]);

  const resetFilters = () => {
    const t = defaultTodayRange();
    setFrom(t.from);
    setTo(t.to);
    setPlate("");
    setViolationType("");
    setSiteName("");
    setStatus("");
    setPaymentStatus("");
  };

  const openViolationZoom = async (row: ChallanHistoryRow) => {
    setZoomError(null);
    const violationId = Number(row.violationId);
    const hasViolation = Number.isFinite(violationId) && violationId > 0;
    const proofSrc = receiverImageUrl(row.proofUrl);

    setZoomLoadingId(hasViolation ? violationId : row.id);
    try {
      if (hasViolation) {
        const { data } = await api.get<{ rows: ViolationEventRow[] }>("/dashboard/violations", {
          params: { violationId, page: 1, pageSize: 1 },
        });
        const violationRow = data.rows?.[0];
        const payload = violationRow ? zoomPayloadFromViolationRow(violationRow) : null;
        if (payload) {
          setZoom(payload);
          return;
        }
      }

      if (proofSrc) {
        setZoom({ src: proofSrc, sceneSrc: proofSrc });
        return;
      }

      setZoomError(
        hasViolation
          ? "Violation capture not found for this ticket."
          : "No capture image available for this ticket."
      );
    } catch {
      if (proofSrc) {
        setZoom({ src: proofSrc, sceneSrc: proofSrc });
        return;
      }
      setZoomError("Could not load violation capture.");
    } finally {
      setZoomLoadingId(null);
    }
  };

  const kpiCard = (label: string, value: string | number, sub?: string, tint?: string) => (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: "1px solid rgba(15,23,42,0.08)",
        bgcolor: tint || "rgba(255,255,255,0.92)",
        minWidth: 0,
      }}
    >
      <Typography sx={{ fontSize: "0.6875rem", fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: pnp.textSecondary }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.35, fontWeight: 900, fontSize: "1.35rem", lineHeight: 1.1 }}>{value}</Typography>
      {sub ? (
        <Typography sx={{ mt: 0.25, fontSize: "0.75rem", color: pnp.textSecondary, fontWeight: 700 }}>{sub}</Typography>
      ) : null}
    </Box>
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, overflow: "hidden" }}>
      <Paper sx={{ ...contentCardSx, p: 1.5 }}>
        <Stack spacing={1.25}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "repeat(2, 1fr)", md: "repeat(3, 1fr)", xl: "repeat(6, minmax(0, 1fr))" },
              gap: 1.25,
              alignItems: "end",
            }}
          >
            <TextField label="From" type="date" size="small" fullWidth value={from} onChange={(e) => setFrom(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="To" type="date" size="small" fullWidth value={to} onChange={(e) => setTo(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField select label="Status" size="small" fullWidth value={status} onChange={(e) => setStatus(e.target.value)}>
              <MenuItem value="">All Status</MenuItem>
              <MenuItem value="draft">Draft</MenuItem>
              <MenuItem value="sent">Sent</MenuItem>
              <MenuItem value="failed">Failed</MenuItem>
            </TextField>
            <TextField select label="Payment Status" size="small" fullWidth value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
              <MenuItem value="">All Payment Status</MenuItem>
              <MenuItem value="paid">Paid</MenuItem>
              <MenuItem value="unpaid">Unpaid</MenuItem>
              <MenuItem value="overdue">Overdue</MenuItem>
            </TextField>
            <TextField select label="Violation Type" size="small" fullWidth value={violationType} onChange={(e) => setViolationType(e.target.value)}>
              <MenuItem value="">All Violation Types</MenuItem>
              {VIOLATION_FILTER_OPTIONS.filter(Boolean).map((v) => (
                <MenuItem key={v} value={v}>
                  {violationTypeLabel(v)}
                </MenuItem>
              ))}
            </TextField>
            <TextField label="Camera Site" size="small" fullWidth value={siteName} onChange={(e) => setSiteName(e.target.value)} />
          </Box>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", sm: "1fr auto auto" },
              gap: 1.25,
              alignItems: "end",
            }}
          >
            <TextField label="Plate Number" size="small" fullWidth value={plate} onChange={(e) => setPlate(e.target.value)} sx={{ maxWidth: { sm: 280 } }} />
            <Button variant="outlined" size="small" onClick={resetFilters} sx={{ fontWeight: 800, minWidth: 88, height: 40 }}>
              Reset
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshOutlinedIcon />}
              onClick={() => void historyQ.refetch()}
              sx={{ fontWeight: 800, minWidth: 128, height: 40 }}
            >
              Apply Filters
            </Button>
          </Box>
        </Stack>
      </Paper>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.25 }}>
          {kpiCard("Total Tickets", summary.total, "In selected range", "rgba(37,99,235,0.06)")}
          {kpiCard("Paid", summary.paid, summary.total ? `${Math.round((summary.paid / summary.total) * 1000) / 10}%` : "0%", "rgba(22,163,74,0.08)")}
          {kpiCard("Unpaid", summary.unpaid, summary.total ? `${Math.round((summary.unpaid / summary.total) * 1000) / 10}%` : "0%", "rgba(245,158,11,0.10)")}
          {kpiCard("Overdue", summary.overdue, summary.total ? `${Math.round((summary.overdue / summary.total) * 1000) / 10}%` : "0%", "rgba(220,38,38,0.08)")}
        </Box>

        <Paper sx={{ ...contentCardSx, p: 1.5, minWidth: 0, overflow: "hidden" }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontWeight: 900, fontSize: "0.9375rem" }}>Ticket Records</Typography>
            <Typography sx={{ fontSize: "0.75rem", color: pnp.textSecondary, fontWeight: 700 }}>
              {rows.length} record{rows.length === 1 ? "" : "s"}
            </Typography>
          </Box>
          {historyQ.isError ? <Alert severity="error" sx={{ mb: 1 }}>Failed to load ticket history.</Alert> : null}
          {zoomError ? (
            <Alert severity="warning" sx={{ mb: 1 }} onClose={() => setZoomError(null)}>
              {zoomError}
            </Alert>
          ) : null}

          <TableContainer sx={{ width: "100%", overflowX: "hidden" }}>
            <Table size="small" sx={{ tableLayout: "fixed", width: "100%" }}>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ ...headSx, width: "11%" }}>TICKET NO.</TableCell>
                  <TableCell sx={{ ...headSx, width: "10%" }}>PLATE</TableCell>
                  <TableCell sx={{ ...headSx, width: "14%" }}>VIOLATION</TableCell>
                  <TableCell sx={{ ...headSx, width: "11%" }}>SITE</TableCell>
                  <TableCell sx={{ ...headSx, width: "18%" }}>DETECTED AT</TableCell>
                  <TableCell sx={{ ...headSx, width: "11%" }} align="right">
                    AMOUNT
                  </TableCell>
                  <TableCell sx={{ ...headSx, width: "10%" }} align="center">
                    STATUS
                  </TableCell>
                  <TableCell sx={{ ...headSx, width: "11%" }} align="center">
                    PAYMENT
                  </TableCell>
                  <TableCell sx={{ ...headSx, width: "4%" }} align="center" />
                  <TableCell sx={{ ...headSx, width: "4%" }} align="center" />
                </TableRow>
              </TableHead>
              <TableBody>
                {historyQ.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={9} sx={{ py: 4, textAlign: "center" }}>
                      <CircularProgress size={28} />
                    </TableCell>
                  </TableRow>
                ) : null}
                {!historyQ.isLoading && pageRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} sx={{ py: 4, textAlign: "center" }}>
                      <Typography sx={{ fontSize: "0.8125rem", color: pnp.textSecondary }}>No ticket records in this range.</Typography>
                    </TableCell>
                  </TableRow>
                ) : null}
                {pageRows.map((row) => {
                  const violationId = Number(row.violationId);
                  const hasViolation = Number.isFinite(violationId) && violationId > 0;
                  const canOpen = hasViolation || Boolean(receiverImageUrl(row.proofUrl));
                  const loadingId = hasViolation ? violationId : row.id;
                  const detected = row.detectedAt || row.createdAt?.slice(0, 19).replace("T", " ") || "—";
                  return (
                    <TableRow key={row.id} hover>
                      <TableCell sx={cellSx}>
                        <Typography sx={{ fontWeight: 900, fontSize: "0.8125rem" }} noWrap>
                          {`VT-${String(row.id).padStart(6, "0")}`}
                        </Typography>
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <Typography sx={{ fontWeight: 800, fontSize: "0.8125rem" }} noWrap>
                          {row.plate}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, overflow: "visible" }}>{violationChip(row.violationType)}</TableCell>
                      <TableCell sx={cellSx}>
                        <Tooltip title={row.siteName || row.cameraId || "—"}>
                          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 600 }} noWrap>
                            {row.siteName || row.cameraId || "—"}
                          </Typography>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={cellSx}>
                        <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, fontVariantNumeric: "tabular-nums" }} noWrap>
                          {detected}
                        </Typography>
                      </TableCell>
                      <TableCell sx={cellSx} align="right">
                        <Typography sx={{ fontWeight: 800, fontSize: "0.8125rem", fontVariantNumeric: "tabular-nums" }} noWrap>
                          {money(row.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, overflow: "visible" }} align="center">
                        {statusChip(row.status)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, overflow: "visible" }} align="center">
                        {paymentChip(row)}
                      </TableCell>
                      <TableCell sx={{ ...cellSx, overflow: "visible", px: 0.5 }} align="center">
                        <Tooltip title={canOpen ? "View violation capture" : "No linked violation"}>
                          <span>
                            <IconButton
                              size="small"
                              disabled={!canOpen || zoomLoadingId === loadingId}
                              onClick={() => void openViolationZoom(row)}
                            >
                              {zoomLoadingId === loadingId ? (
                                <CircularProgress size={18} />
                              ) : (
                                <VisibilityOutlinedIcon fontSize="small" />
                              )}
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ ...cellSx, overflow: "visible", px: 0.5 }} align="center">
                        <Tooltip title="View ticket PDF">
                          <IconButton
                            size="small"
                            onClick={() => setPdfRow(row)}
                            sx={{ color: "error.main" }}
                          >
                            <PictureAsPdfOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          <Box sx={{ display: "flex", justifyContent: "center", pt: 2.5 }}>
            <Pagination
              count={pageCount}
              page={page}
              onChange={(_, p) => setPage(p)}
              color="primary"
              shape="rounded"
              showFirstButton
              showLastButton
              disabled={historyQ.isLoading || rows.length === 0}
            />
          </Box>
        </Paper>
      </Box>

      <ImageZoomDialog open={!!zoom} payload={zoom} onClose={() => setZoom(null)} title="Violation capture" />
      <ChallanPdfModal
        open={!!pdfRow}
        challanId={pdfRow?.id ?? null}
        ticketNo={pdfRow ? `VT-${String(pdfRow.id).padStart(6, "0")}` : ""}
        onClose={() => setPdfRow(null)}
      />
    </Box>
  );
}
