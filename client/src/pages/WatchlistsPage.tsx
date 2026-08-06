import { useEffect, useState, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Skeleton,

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
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { api } from "../lib/api";
import { useCameras } from "../hooks/useCameras";
import { contentCardSx, pageLayoutSx } from "../lib/uiSurfaces";
import { pnp, pnpFont } from "../lib/pnpTheme";

import {
  FILTER_ROW_HEIGHT,
  filterRowButtonSx,
  filterRowFormControlSx,
  filterRowJumpToTodaySx,
  filterRowTextFieldSlotProps,
} from "../lib/filterRowControls";

const dialogSelectSx = {
  ...filterRowFormControlSx,
  "& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    py: 0,
    minHeight: FILTER_ROW_HEIGHT,
    maxHeight: FILTER_ROW_HEIGHT,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};

import { dayjsInSite, ymdSite } from "../lib/siteTimeZone";
import type { ConditionRow, ListEntry, VehicleListRow, WatchHit, WatchRule, WatchSite } from "../lib/watchlistTypes";

const ACCESS_TYPES = [
  { value: "allow", label: "Allow" },
  { value: "deny", label: "Deny" },
];
const SECURITY_TYPES = [
  { value: "suspicious", label: "Unauthorized" },
  { value: "hotlist", label: "Key staff" },
];
type RuleFilters = { name: string; camera_id: string; access_type: string; security_type: string };
type ListFilters = { name: string; site_id: string };
type HitFilters = { plate: string; rule_name: string; site_id: string; access_type: string; security_type: string };

const LP_OPS = [
  { value: "eq", label: "Equals" },
  { value: "contains", label: "Contains" },
  { value: "startswith", label: "Starts with" },
  { value: "endswith", label: "Ends with" },
];

function emptyCondition(): ConditionRow {
  return { attr: "lp", lpOp: "eq", value: "" };
}

function extractCameraIdsFromConditions(conds: unknown[]): string[] {
  for (const block of conds) {
    if (!block || typeof block !== "object") continue;
    const b = block as { _cameras?: { ids?: string[] } };
    if (b._cameras?.ids?.length) return b._cameras.ids.map(String);
  }
  return [];
}

function apiConditionsToRows(conds: unknown[]): ConditionRow[] {
  const rows: ConditionRow[] = [];
  for (const block of conds) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, Record<string, string>> & { _cameras?: unknown };
    if (b._cameras) continue;
    if (b.lp) {
      const [op, val] = Object.entries(b.lp)[0] ?? ["eq", ""];
      rows.push({ attr: "lp", lpOp: op as ConditionRow["lpOp"], value: val });
    } else if (b.make) {
      rows.push({ attr: "make", value: b.make.eq });
    } else if (b.colour) {
      rows.push({ attr: "colour", value: b.colour.eq });
    } else if (b.vehicle_category) {
      rows.push({ attr: "vehicle_category", category: b.vehicle_category.eq, value: b.vehicle_category.eq });
    }
  }
  return rows.length ? rows : [emptyCondition()];
}

function ConditionEditor({ rows, onChange }: { rows: ConditionRow[]; onChange: (r: ConditionRow[]) => void }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      {rows.map((row, i) => (
        <Box
          key={i}
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "72px minmax(120px, 0.45fr) 1fr 40px" },
            gap: 1.5,
            alignItems: "center",
          }}
        >
          <Typography sx={{ fontSize: "0.8125rem", fontWeight: 700, color: pnp.textSecondary, pl: 0.5 }}>Staff ID</Typography>
          <FormControl size="small" fullWidth sx={dialogSelectSx}>
            <InputLabel>Match</InputLabel>
            <Select
              label="Match"
              value={row.lpOp ?? "eq"}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...row, attr: "lp", lpOp: e.target.value as ConditionRow["lpOp"] };
                onChange(next);
              }}
            >
              {LP_OPS.map((o) => (
                <MenuItem key={o.value} value={o.value}>
                  {o.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="Staff ID value"
            value={row.value ?? ""}
            onChange={(e) => {
              const next = [...rows];
              next[i] = { ...row, attr: "lp", value: e.target.value };
              onChange(next);
            }}
            {...filterRowTextFieldSlotProps}
          />
          <IconButton
            size="small"
            aria-label="Remove condition"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            disabled={rows.length <= 1}
            sx={{ width: 40, height: FILTER_ROW_HEIGHT }}
          >
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
}

export function WatchlistsPage() {

  const qc = useQueryClient();

  const [ruleFilters, setRuleFilters] = useState<RuleFilters>({ name: "", camera_id: "", access_type: "", security_type: "" });

  const [ruleDialog, setRuleDialog] = useState<"create" | "edit" | null>(null);
  const [editRuleId, setEditRuleId] = useState<number | null>(null);

  const [viewConditions, setViewConditions] = useState<string | null>(null);

  const camerasQ = useCameras();
  const cameras = camerasQ.data?.cameras ?? [];

  const rulesQ = useQuery({
    queryKey: ["watchlist", "rules", ruleFilters],
    queryFn: async () =>
      (
        await api.get<{ total: number; rows: WatchRule[] }>("/watchlist/rules", {
          params: {
            page: 1,
            pageSize: 25,
            name: ruleFilters.name || undefined,
            camera_id: ruleFilters.camera_id || undefined,
            access_type: ruleFilters.access_type || undefined,
            security_type: ruleFilters.security_type || undefined,
          },
        })
      ).data,
    placeholderData: keepPreviousData,
  });

  return (
    <Box sx={pageLayoutSx}>
      <Paper elevation={0} sx={{ ...contentCardSx, p: { xs: 2, sm: 2.25 } }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "flex-end", gap: 2, flexWrap: "wrap" }}>
          <Chip
            icon={<VisibilityOutlinedIcon />}
            label={`${rulesQ.data?.total ?? rulesQ.data?.rows?.length ?? "—"} presence rules`}
            sx={{ fontWeight: 600, bgcolor: pnp.purpleSoft, color: pnp.purple, border: "none" }}
          />
        </Box>

        {}
      </Paper>

        <WatchRulesTab
          cameras={cameras}
          rows={rulesQ.data?.rows}
          pending={rulesQ.isPending}
          filters={ruleFilters}
          onFilters={setRuleFilters}
          onAdd={() => {
            setEditRuleId(null);
            setRuleDialog("create");
          }}
          onEdit={(id) => {
            setEditRuleId(id);
            setRuleDialog("edit");
          }}
          onViewConditions={setViewConditions}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["watchlist", "rules"] })}
          onDelete={async (id) => {
            await api.delete(`/watchlist/rules/${id}`);
            qc.invalidateQueries({ queryKey: ["watchlist"] });
          }}
        />

      {}

      {}

        <RuleFormDialog
          open={ruleDialog != null}
          mode={ruleDialog ?? "create"}
          ruleId={editRuleId}
          onClose={() => setRuleDialog(null)}
        onSaved={() => {
          setRuleDialog(null);
          qc.invalidateQueries({ queryKey: ["watchlist"] });
        }}
      />

      {}

      <Dialog open={viewConditions != null} onClose={() => setViewConditions(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Staff match rules</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontFamily: "monospace", fontSize: "0.8125rem", whiteSpace: "pre-wrap" }}>{viewConditions}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewConditions(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function FilterBar({ children }: { children: ReactNode }) {
  return (
    <Paper
      elevation={0}
      sx={{
        ...contentCardSx,
        p: 2,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, minmax(0, 1fr))", lg: "repeat(5, minmax(0, 1fr))" },
        gap: 1.5,
        alignItems: "end",
      }}
    >
      {children}
    </Paper>
  );
}

function FilterBarActions({
  onSearch,
  onAdd,
  addLabel,
}: {
  onSearch: () => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-end", height: "100%" }}>
      <Button variant="contained" size="small" sx={filterRowButtonSx} onClick={onSearch}>
        Search
      </Button>
      <Button variant="outlined" size="small" startIcon={<AddIcon sx={{ fontSize: 18 }} />} sx={filterRowButtonSx} onClick={onAdd}>
        {addLabel}
      </Button>
    </Box>
  );
}

function WatchRulesTab({
  cameras,
  rows,
  pending,
  filters,
  onFilters,
  onAdd,
  onEdit,
  onViewConditions,
  onRefresh,
  onDelete,
}: {
  cameras: { id: string; name: string }[];
  rows?: WatchRule[];
  pending?: boolean;
  filters: RuleFilters;
  onFilters: (f: RuleFilters) => void;
  onAdd: () => void;
  onEdit: (id: number) => void;
  onViewConditions: (s: string) => void;
  onRefresh: () => void;
  onDelete: (id: number) => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FilterBar>
        <TextField
          label="Name"
          value={filters.name}
          onChange={(e) => onFilters({ ...filters, name: e.target.value })}
          {...filterRowTextFieldSlotProps}
        />
        <FormControl size="small" sx={dialogSelectSx} fullWidth>
          <InputLabel id="watchlist-filter-camera-label">Cameras</InputLabel>
          <Select
            labelId="watchlist-filter-camera-label"
            label="Cameras"
            displayEmpty
            value={filters.camera_id}
            onChange={(e) => onFilters({ ...filters, camera_id: e.target.value })}
            renderValue={(v) => {
              if (!v) return "All";
              return cameras.find((c) => c.id === v)?.name ?? v;
            }}
          >
            <MenuItem value="">All</MenuItem>
            {cameras.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={filterRowFormControlSx}>
          <InputLabel>Access</InputLabel>
          <Select label="Access" displayEmpty value={filters.access_type} onChange={(e) => onFilters({ ...filters, access_type: e.target.value })}>
            <MenuItem value="">All</MenuItem>
            {ACCESS_TYPES.map((a) => (
              <MenuItem key={a.value} value={a.value}>
                {a.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={filterRowFormControlSx}>
          <InputLabel>Alert type</InputLabel>
          <Select
            label="Alert type"
            displayEmpty
            value={filters.security_type}
            onChange={(e) => onFilters({ ...filters, security_type: e.target.value })}
          >
            <MenuItem value="">All</MenuItem>
            {SECURITY_TYPES.map((s) => (
              <MenuItem key={s.value} value={s.value}>
                {s.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FilterBarActions onSearch={onRefresh} onAdd={onAdd} addLabel="Add presence rule" />
      </FilterBar>

      <Paper elevation={0} sx={{ ...contentCardSx, overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: pnp.navySidebar }}>
                {["Name", "Match on", "Cameras", "Access", "Alert type", "Valid range", "Actions"].map((h) => (
                  <TableCell key={h} sx={{ color: "#fff", fontWeight: 700, fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {pending
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={7}>
                        <Skeleton height={32} />
                      </TableCell>
                    </TableRow>
                  ))
                : (rows ?? []).map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{r.name}</TableCell>
                      <TableCell>
                        {r.filterType === "plate" ? "Staff ID" : `Staff group (${r.vehicleListName ?? "—"})`}
                      </TableCell>
                      <TableCell>{r.cameraNames?.length ? r.cameraNames.join(", ") : r.siteName ?? "—"}</TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>{r.accessType}</TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>{r.securityType}</TableCell>
                      <TableCell sx={{ fontSize: "0.8125rem" }}>
                        {r.validFrom ? `${r.validFrom} – ${r.validTo ?? ""}` : "—"}
                      </TableCell>
                      <TableCell>
                        {r.filterType === "plate" ? (
                          <Tooltip title="View match rules">
                            <IconButton size="small" onClick={() => onViewConditions(r.conditionsSummary)}>
                              <VisibilityOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        <IconButton size="small" onClick={() => onEdit(r.id)}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => onDelete(r.id)}>
                          <DeleteOutlinedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!pending && !rows?.length ? (
          <Typography sx={{ ...pnpFont.cardSubtitle, py: 4, textAlign: "center" }}>No presence rules found</Typography>
        ) : null}
      </Paper>
    </Box>
  );
}

export function VehicleListsTab({
  sites,
  rows,
  pending,
  filters,
  onFilters,
  onAdd,
  onEdit,
  onManageEntries,
  onToggle,
  onRefresh,
}: {
  sites: WatchSite[];
  rows?: VehicleListRow[];
  pending?: boolean;
  filters: ListFilters;
  onFilters: (f: ListFilters) => void;
  onAdd: () => void;
  onEdit: (id: number) => void;
  onManageEntries: (id: number) => void;
  onToggle: (id: number) => void;
  onRefresh: () => void;
}) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FilterBar>
        <TextField
          label="List name"
          value={filters.name}
          onChange={(e) => onFilters({ ...filters, name: e.target.value })}
          {...filterRowTextFieldSlotProps}
        />
        <FormControl size="small" sx={filterRowFormControlSx}>
          <InputLabel>Site</InputLabel>
          <Select label="Site" value={filters.site_id} onChange={(e) => onFilters({ ...filters, site_id: e.target.value })}>
            <MenuItem value="">All</MenuItem>
            {sites.map((s) => (
              <MenuItem key={s.id} value={String(s.id)}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ gridColumn: { sm: "span 2" } }}>
          <FilterBarActions onSearch={onRefresh} onAdd={onAdd} addLabel="Add staff group" />
        </Box>
      </FilterBar>

      <Paper elevation={0} sx={{ ...contentCardSx, overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: pnp.navySidebar }}>
                {["Name", "Site", "Entries", "Status", "Actions"].map((h) => (
                  <TableCell key={h} sx={{ color: "#fff", fontWeight: 700, fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {pending
                ? Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={5}>
                        <Skeleton height={32} />
                      </TableCell>
                    </TableRow>
                  ))
                : (rows ?? []).map((l) => (
                    <TableRow key={l.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>{l.name}</TableCell>
                      <TableCell>{l.siteName ?? "—"}</TableCell>
                      <TableCell>{l.entryCount}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={l.enabled ? "Enabled" : "Disabled"}
                          sx={{
                            fontWeight: 700,
                            bgcolor: l.enabled ? pnp.successSoft : "#F1F5F9",
                            color: l.enabled ? pnp.success : pnp.textMuted,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => onManageEntries(l.id)}>
                          Plates
                        </Button>
                        <IconButton size="small" onClick={() => onToggle(l.id)}>
                          <VisibilityOutlinedIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" onClick={() => onEdit(l.id)}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}

export function HitsTab({
  ruleNames,
  rows,
  pending,
  from,
  to,
  onFrom,
  onTo,
  filters,
  onFilters,
  onPlate,
}: {
  ruleNames: string[];
  rows?: WatchHit[];
  pending?: boolean;
  from: string;
  to: string;
  onFrom: (v: string) => void;
  onTo: (v: string) => void;
  filters: HitFilters;
  onFilters: (f: HitFilters) => void;
  onPlate: (plate: string) => void;
}) {
  const today = ymdSite();
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <FilterBar>
        <DatePicker
          label="From"
          value={dayjsInSite(from)}
          onChange={(d) => d && onFrom(d.format("YYYY-MM-DD"))}
          slotProps={{ textField: filterRowTextFieldSlotProps }}
        />
        <DatePicker
          label="To"
          value={dayjsInSite(to)}
          onChange={(d) => d && onTo(d.format("YYYY-MM-DD"))}
          slotProps={{ textField: filterRowTextFieldSlotProps }}
        />
        <TextField
          label="Staff ID"
          value={filters.plate}
          onChange={(e) => onFilters({ ...filters, plate: e.target.value })}
          {...filterRowTextFieldSlotProps}
        />
        <FormControl size="small" sx={filterRowFormControlSx}>
          <InputLabel>Rule</InputLabel>
          <Select label="Rule" value={filters.rule_name} onChange={(e) => onFilters({ ...filters, rule_name: e.target.value })}>
            <MenuItem value="">All</MenuItem>
            {ruleNames.map((n) => (
              <MenuItem key={n} value={n}>
                {n}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Button
          variant="outlined"
          size="small"
          sx={filterRowJumpToTodaySx(from === today && to === today)}
          onClick={() => {
            onFrom(today);
            onTo(today);
          }}
        >
          Today
        </Button>
      </FilterBar>

      <Paper elevation={0} sx={{ ...contentCardSx, overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ bgcolor: pnp.navySidebar }}>
                {["Plate", "List / Rule", "Site", "Access", "Security", "Camera", "Detected", "Source"].map((h) => (
                  <TableCell key={h} sx={{ color: "#fff", fontWeight: 700, fontSize: "0.6875rem", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {pending
                ? Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <Skeleton height={32} />
                      </TableCell>
                    </TableRow>
                  ))
                : (rows ?? []).map((h) => (
                    <TableRow key={h.id} hover sx={{ cursor: "pointer" }} onClick={() => h.plate && onPlate(h.plate)}>
                      <TableCell sx={{ fontWeight: 800, color: pnp.primary }}>{h.plate ?? "—"}</TableCell>
                      <TableCell>{h.listName || h.ruleName || "—"}</TableCell>
                      <TableCell>{h.siteName ?? "—"}</TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>{h.accessType ?? "—"}</TableCell>
                      <TableCell sx={{ textTransform: "capitalize" }}>{h.securityType ?? "—"}</TableCell>
                      <TableCell>{h.camera ?? "—"}</TableCell>
                      <TableCell sx={{ fontSize: "0.8125rem" }}>{h.createdAt}</TableCell>
                      <TableCell>
                        <Chip size="small" label={h.source === "anpr" ? "ANPR" : "Alert"} sx={{ fontWeight: 700, fontSize: "0.625rem" }} />
                      </TableCell>
                    </TableRow>
                  ))}
            </TableBody>
          </Table>
        </TableContainer>
        {!pending && !rows?.length ? (
          <Typography sx={{ ...pnpFont.cardSubtitle, py: 4, textAlign: "center" }}>No watchlist hits in this period</Typography>
        ) : null}
      </Paper>
    </Box>
  );
}

function RuleFormDialog({
  open,
  mode,
  ruleId,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  ruleId: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const camerasQ = useCameras();
  const cameras = camerasQ.data?.cameras ?? [];
  const cameraMap = camerasQ.data?.cameraMap ?? {};

  const [name, setName] = useState("");
  const [cameraIds, setCameraIds] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [accessType, setAccessType] = useState("deny");
  const [securityType, setSecurityType] = useState("hotlist");
  const [conditions, setConditions] = useState<ConditionRow[]>([emptyCondition()]);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const ruleQ = useQuery({
    queryKey: ["watchlist", "rule", ruleId],
    queryFn: async () => (await api.get<{ rule: WatchRule }>(`/watchlist/rules/${ruleId}`)).data.rule,
    enabled: open && mode === "edit" && ruleId != null,
  });

  useEffect(() => {
    if (!open) return;
    if (mode === "create") {
      setName("");
      setNotes("");
      setCameraIds(cameras.map((c) => c.id));
      setConditions([emptyCondition()]);
      setValidFrom("");
      setValidTo("");
      setErr(null);
      return;
    }
    if (ruleQ.data) {
      const r = ruleQ.data;
      setName(r.name);
      setNotes(r.notes);
      setAccessType(r.accessType);
      setSecurityType(r.securityType);
      setCameraIds(r.cameraIds?.length ? r.cameraIds : extractCameraIdsFromConditions(r.conditions as unknown[]));
      setConditions(apiConditionsToRows(r.conditions as unknown[]));
      setValidFrom(r.validFrom ?? "");
      setValidTo(r.validTo ?? "");
    }
  }, [open, mode, ruleQ.data, cameras]);

  const saveM = useMutation({
    mutationFn: async () => {
      const body = {
        name,
        camera_ids: cameraIds,
        notes,
        access_type: accessType,
        security_type: securityType,
        condition_rows: conditions.map((c) => ({ ...c, attr: "lp" as const })),
        valid_from: validFrom || null,
        valid_to: validTo || null,
      };
      if (mode === "edit" && ruleId) await api.put(`/watchlist/rules/${ruleId}`, body);
      else await api.post("/watchlist/rules", body);
    },
    onSuccess: onSaved,
    onError: () => setErr("Could not save presence rule"),
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{mode === "edit" ? "Edit presence rule" : "Add presence rule"}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        {err ? <Alert severity="error">{err}</Alert> : null}
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2, alignItems: "center" }}>
          <TextField
            label="Rule name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            {...filterRowTextFieldSlotProps}
          />
          <FormControl size="small" fullWidth sx={dialogSelectSx}>
            <InputLabel>Cameras</InputLabel>
            <Select
              multiple
              label="Cameras"
              value={cameraIds}
              onChange={(e) => {
                const v = e.target.value;
                setCameraIds(typeof v === "string" ? v.split(",") : v);
              }}
              renderValue={(selected) =>
                (selected as string[])
                  .map((id) => cameraMap[id] ?? cameras.find((c) => c.id === id)?.name ?? id)
                  .join(", ")
              }
            >
              {cameras.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth sx={dialogSelectSx}>
            <InputLabel>Access control</InputLabel>
            <Select label="Access control" value={accessType} onChange={(e) => setAccessType(e.target.value)}>
              {ACCESS_TYPES.map((a) => (
                <MenuItem key={a.value} value={a.value}>
                  {a.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" fullWidth sx={dialogSelectSx}>
            <InputLabel>Alert type</InputLabel>
            <Select label="Alert type" value={securityType} onChange={(e) => setSecurityType(e.target.value)}>
              {SECURITY_TYPES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
        <TextField label="Notes" multiline minRows={2} value={notes} onChange={(e) => setNotes(e.target.value)} size="small" />
        <ConditionEditor rows={conditions} onChange={setConditions} />
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2, alignItems: "center" }}>
          <TextField
            type="date"
            label="Valid from"
            value={validFrom}
            onChange={(e) => setValidFrom(e.target.value)}
            {...filterRowTextFieldSlotProps}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            type="date"
            label="Valid to"
            value={validTo}
            onChange={(e) => setValidTo(e.target.value)}
            {...filterRowTextFieldSlotProps}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={saveM.isPending} onClick={() => saveM.mutate()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function VehicleListFormDialog({
  open,
  mode,
  listId,
  initial,
  sites,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: "create" | "edit";
  listId: number | null;
  initial?: VehicleListRow;
  sites: WatchSite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [siteId, setSiteId] = useState(sites[0]?.id ?? 1);
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && initial) {
      setName(initial.name);
      setSiteId(initial.siteId);
      setEnabled(initial.enabled);
    } else {
      setName("");
      setSiteId(sites[0]?.id ?? 1);
      setEnabled(true);
    }
  }, [open, mode, initial, sites]);

  const saveM = useMutation({
    mutationFn: async () => {
      const body = { name, site_id: siteId, enabled };
      if (mode === "edit" && listId) await api.put(`/watchlist/vehicle-lists/${listId}`, body);
      else await api.post("/watchlist/vehicle-lists", body);
    },
    onSuccess: onSaved,
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{mode === "edit" ? "Edit vehicle list" : "Add vehicle list"}</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
        <TextField label="List name" required value={name} onChange={(e) => setName(e.target.value)} />
        <FormControl>
          <InputLabel>Site</InputLabel>
          <Select label="Site" value={siteId} onChange={(e) => setSiteId(Number(e.target.value))}>
            {sites.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl>
          <InputLabel>Status</InputLabel>
          <Select label="Status" value={enabled ? "1" : "0"} onChange={(e) => setEnabled(e.target.value === "1")}>
            <MenuItem value="1">Enabled</MenuItem>
            <MenuItem value="0">Disabled</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => saveM.mutate()}>
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function EntriesDrawer({
  listId,
  listName,
  rows,
  pending,
  open,
  entryDialogOpen,
  onOpenEntryDialog,
  onCloseEntryDialog,
  onClose,
  onRefresh,
}: {
  listId: number | null;
  listName?: string;
  rows?: ListEntry[];
  pending?: boolean;
  open: boolean;
  entryDialogOpen: boolean;
  onOpenEntryDialog: () => void;
  onCloseEntryDialog: () => void;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [conditions, setConditions] = useState<ConditionRow[]>([emptyCondition()]);
  const addM = useMutation({
    mutationFn: async () => api.post(`/watchlist/vehicle-lists/${listId}/entries`, { condition_rows: conditions }),
    onSuccess: () => {
      onCloseEntryDialog();
      setConditions([emptyCondition()]);
      onRefresh();
    },
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>Plates — {listName ?? "Vehicle list"}</DialogTitle>
      <DialogContent>
        <Button size="small" startIcon={<AddIcon />} sx={{ mb: 2 }} onClick={onOpenEntryDialog}>
          Add plate
        </Button>
        {pending ? <Skeleton height={120} /> : null}
        {(rows ?? []).map((e) => (
          <Box key={e.id} sx={{ py: 1, borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
            <Typography sx={{ fontWeight: 700 }}>{e.summary}</Typography>
          </Box>
        ))}
        <Dialog open={entryDialogOpen} onClose={onCloseEntryDialog} maxWidth="sm" fullWidth>
          <DialogTitle>Add staff to group</DialogTitle>
          <DialogContent>
            <ConditionEditor rows={conditions} onChange={setConditions} />
          </DialogContent>
          <DialogActions>
            <Button onClick={onCloseEntryDialog}>Cancel</Button>
            <Button variant="contained" onClick={() => addM.mutate()}>
              Add
            </Button>
          </DialogActions>
        </Dialog>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
