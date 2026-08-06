import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Chip, CircularProgress, Divider, Grid, MenuItem, Paper,
  Snackbar, Stack, Switch, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import TuneOutlinedIcon from "@mui/icons-material/TuneOutlined";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import { api } from "../lib/api";
import { contentCardSx, pageLayoutSx } from "../lib/uiSurfaces";
import { INFERENCE_MODULES } from "../lib/inferenceModules";
import { RbacPanel } from "../components/settings/RbacPanel";
import { usePermissions } from "../lib/permissions";

type Scope = string;
type SettingEntry = {
  value: Record<string, any>;
  version: number;
  updatedBy: string | null;
  updatedAt: string;
  appliedBy: "web-app" | "inference-host";
};
type SettingsResponse = {
  settings: Record<Scope, SettingEntry>;
  publishedConfig: { version: number; publishedAt: string; key: string } | null;
};

/** Field descriptors per scope, so each section is declarative. */
type Field =
  | { k: string; label: string; type: "number"; min?: number; max?: number; step?: number; help?: string }
  | { k: string; label: string; type: "text"; help?: string }
  | { k: string; label: string; type: "bool"; help?: string }
  | { k: string; label: string; type: "select"; options: { v: any; label: string }[]; help?: string };

const HOURS = Array.from({ length: 24 }, (_, h) => ({ v: h, label: `${String(h).padStart(2, "0")}:00` }));

const SECTIONS: { scope: Scope; title: string; blurb: string; fields: Field[] }[] = [
  {
    scope: "general",
    title: "General",
    blurb: "Applies to this web application immediately.",
    fields: [
      { k: "siteName", label: "Site name", type: "text" },
      { k: "timezone", label: "Timezone", type: "text", help: "IANA zone, e.g. Asia/Kolkata" },
      { k: "defaultReportDays", label: "Default report duration (days)", type: "number", min: 1, max: 365 },
      { k: "dateFormat", label: "Date format", type: "text" },
      { k: "timeFormat", label: "Time format", type: "text" },
      { k: "autoRefreshSeconds", label: "Auto-refresh interval (seconds)", type: "number", min: 10, max: 3600,
        help: "Also controls how often Monitoring pages refresh." },
      { k: "notifyEmail", label: "Notification email", type: "text" },
    ],
  },
  {
    scope: "walkins", title: "Walk-ins", blurb: "Person detection at entrances.",
    fields: [
      { k: "enabled", label: "Module enabled", type: "bool" },
      { k: "confidence", label: "Detection confidence", type: "number", min: 0, max: 1, step: 0.05 },
      { k: "minPersonSize", label: "Minimum person size (px)", type: "number", min: 1, max: 5000 },
      { k: "cooldownSeconds", label: "Cooldown between detections (s)", type: "number", min: 0, max: 3600 },
    ],
  },
  {
    scope: "loitering", title: "Loitering", blurb: "Dwell-time detection.",
    fields: [
      { k: "enabled", label: "Module enabled", type: "bool" },
      { k: "thresholdSeconds", label: "Loitering threshold", type: "select",
        options: [
          { v: 180, label: "3 minutes (current default)" }, { v: 240, label: "4 minutes" },
          { v: 300, label: "5 minutes" }, { v: 360, label: "6 minutes" },
        ],
        help: "How long someone must linger before a clip is written." },
      { k: "confidence", label: "Detection confidence", type: "number", min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    scope: "intrusion", title: "Intrusion", blurb: "Tripwire crossings into restricted areas.",
    fields: [
      { k: "enabled", label: "Module enabled", type: "bool" },
      { k: "zonesEnabled", label: "Restricted zones enabled", type: "bool" },
      { k: "confidence", label: "Detection confidence", type: "number", min: 0, max: 1, step: 0.05 },
      { k: "alertDelaySeconds", label: "Alert delay (s)", type: "number", min: 0, max: 3600 },
    ],
  },
  {
    scope: "after_hours", title: "After Hours", blurb: "Armed window for presence detection.",
    fields: [
      { k: "enabled", label: "Module enabled", type: "bool" },
      { k: "startHour", label: "Arm from", type: "select", options: HOURS },
      { k: "endHour", label: "Disarm at", type: "select", options: HOURS,
        help: "Wraps midnight when the start hour is later than the end hour." },
      { k: "confidence", label: "Detection confidence", type: "number", min: 0, max: 1, step: 0.05 },
    ],
  },
  {
    scope: "kitchen_unattended", title: "Kitchen Unattended", blurb: "Raises an event when no staff are present.",
    fields: [
      { k: "enabled", label: "Module enabled", type: "bool" },
      { k: "maxUnattendedSeconds", label: "Maximum unattended duration (s)", type: "number", min: 10, max: 7200 },
      { k: "alertCooldownSeconds", label: "Alert cooldown (s)", type: "number", min: 0, max: 7200 },
      { k: "confidence", label: "Detection confidence", type: "number", min: 0, max: 1, step: 0.05 },
    ],
  },
];

function SectionCard({
  section, entry, onSaved, onToast,
}: {
  section: (typeof SECTIONS)[number];
  entry?: SettingEntry;
  onSaved: () => void;
  onToast: (m: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, any>>(entry?.value ?? {});
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => setDraft(entry?.value ?? {}), [entry]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(entry?.value ?? {});
  const detectorScope = entry?.appliedBy === "inference-host";

  const save = useMutation({
    mutationFn: async () => (await api.put(`/settings/${section.scope}`, { value: draft })).data,
    onSuccess: (d: any) => {
      setErrors([]);
      onToast(
        d.pendingDelivery
          ? `Saved and published v${d.version}. The inference host applies it on its next poll.`
          : `Saved. Applied immediately.`
      );
      onSaved();
    },
    onError: (e: any) => setErrors(e?.response?.data?.errors ?? [e?.message ?? "Save failed"]),
  });

  const set = (k: string, v: any) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <Paper sx={{ ...contentCardSx, height: "100%" }}>
      <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", gap: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{section.title}</Typography>
          <Typography variant="caption" color="text.secondary">{section.blurb}</Typography>
        </Box>
        {detectorScope && (
          // Being explicit beats implying control this app does not have.
          <Tooltip title="Saved here and published to S3. The on-prem inference services apply it when they next poll the config.">
            <Chip size="small" variant="outlined" color="warning" icon={<InfoOutlinedIcon />}
                  label="Applied by inference host" sx={{ height: 24, fontSize: 11 }} />
          </Tooltip>
        )}
      </Stack>
      <Divider sx={{ my: 1.5 }} />

      <Grid container spacing={1.5}>
        {section.fields.map((f) => (
          <Grid key={f.k} size={{ xs: 12, sm: 6 }}>
            {f.type === "bool" ? (
              <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{f.label}</Typography>
                  {f.help && <Typography variant="caption" color="text.secondary">{f.help}</Typography>}
                </Box>
                <Switch checked={Boolean(draft[f.k])} onChange={(e) => set(f.k, e.target.checked)} />
              </Stack>
            ) : f.type === "select" ? (
              <TextField
                select fullWidth size="small" label={f.label} helperText={f.help}
                value={draft[f.k] ?? ""} onChange={(e) => set(f.k, Number(e.target.value))}
              >
                {f.options.map((o) => <MenuItem key={String(o.v)} value={o.v}>{o.label}</MenuItem>)}
              </TextField>
            ) : (
              <TextField
                fullWidth size="small" label={f.label} helperText={f.help}
                type={f.type === "number" ? "number" : "text"}
                value={draft[f.k] ?? ""}
                onChange={(e) => set(f.k, f.type === "number" ? Number(e.target.value) : e.target.value)}
                slotProps={f.type === "number" ? { htmlInput: { min: (f as any).min, max: (f as any).max, step: (f as any).step ?? 1 } } : undefined}
              />
            )}
          </Grid>
        ))}
      </Grid>

      {errors.length > 0 && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {errors.map((e) => <div key={e}>{e}</div>)}
        </Alert>
      )}

      <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: "center" }}>
        <Button variant="contained" size="small" disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save changes"}
        </Button>
        <Button size="small" disabled={!dirty} onClick={() => setDraft(entry?.value ?? {})}>
          Discard
        </Button>
        <Box sx={{ flex: 1 }} />
        {entry && (
          <Typography variant="caption" color="text.secondary">
            v{entry.version}
            {entry.updatedBy ? ` · ${entry.updatedBy}` : ""}
          </Typography>
        )}
      </Stack>
    </Paper>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const [toast, setToast] = useState<string | null>(null);
  const { can } = usePermissions();
  const nav = useNavigate();
  const loc = useLocation();

  // RBAC lives here as a tab rather than its own nav entry. /settings/access
  // still resolves so existing links keep working - it just selects the tab.
  const showRbac = can("access_control");
  const tab = loc.pathname.endsWith("/access") && showRbac ? "rbac" : "config";

  const { data, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get("/settings")).data as SettingsResponse,
  });

  const republish = useMutation({
    mutationFn: async () => (await api.post("/settings/publish", {})).data,
    onSuccess: (d: any) =>
      setToast(d.ok ? `Re-published config v${d.version} to S3.` : `Publish failed: ${d.error}`),
  });

  if (isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>;
  }

  return (
    <Box sx={pageLayoutSx}>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 800 }}>Settings</Typography>
        <Typography variant="body2" color="text.secondary">
          Configure the application, the AI detection modules and who can see what.
        </Typography>
      </Box>

      <Paper sx={{ ...contentCardSx, p: 0 }}>
        <Tabs
          value={tab}
          onChange={(_e, v) => nav(v === "rbac" ? "/settings/access" : "/settings")}
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="config" label="Configuration" icon={<TuneOutlinedIcon />} iconPosition="start" sx={{ minHeight: 48 }} />
          {showRbac && (
            <Tab value="rbac" label="RBAC" icon={<AdminPanelSettingsOutlinedIcon />} iconPosition="start" sx={{ minHeight: 48 }} />
          )}
        </Tabs>
      </Paper>

      {tab === "rbac" ? <RbacPanel /> : (
      <>

      {/* The single most important thing an administrator needs to understand
          about this screen, stated plainly rather than buried. */}
      <Alert severity="info" icon={<CloudUploadOutlinedIcon />}>
        <Stack direction="row" sx={{ alignItems: "center", gap: 1, flexWrap: "wrap" }}>
          <Box>
            <strong>Detection settings are applied by the inference host.</strong>{" "}
            Saving stores the value and publishes it to S3 as{" "}
            <code>{data?.publishedConfig?.key ?? "config/inference-config.json"}</code>. The on-prem
            services apply it on their next poll — until they do, the value is recorded but not yet in force.
            {data?.publishedConfig
              ? ` Currently published: v${data.publishedConfig.version}.`
              : " Nothing published yet."}
          </Box>
          <Box sx={{ flex: 1 }} />
          <Button size="small" variant="outlined" disabled={republish.isPending}
                  onClick={() => republish.mutate()}>
            Re-publish
          </Button>
        </Stack>
      </Alert>

      <Grid container spacing={1.5}>
        {SECTIONS.map((sec) => {
          const isModule = INFERENCE_MODULES.some((m) => m.key === sec.scope);
          return (
            <Grid key={sec.scope} size={{ xs: 12, lg: isModule ? 6 : 12 }}>
              <SectionCard
                section={sec}
                entry={data?.settings[sec.scope]}
                onSaved={() => qc.invalidateQueries({ queryKey: ["settings"] })}
                onToast={setToast}
              />
            </Grid>
          );
        })}
      </Grid>

      </>
      )}

      <Snackbar
        open={Boolean(toast)} autoHideDuration={6000} onClose={() => setToast(null)}
        message={toast ?? ""} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    </Box>
  );
}
