import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, MenuItem, Paper, Snackbar, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import LockIcon from "@mui/icons-material/Lock";
import { api } from "../lib/api";
import { contentCardSx, pageLayoutSx } from "../lib/uiSurfaces";
import { tableCellSx, tableHeadSx } from "../components/monitoring/monitoringTokens";
import { usePermissions } from "../lib/permissions";

type Page = { key: string; label: string; group: string; route: string };
type Role = {
  role: string; label: string; description: string | null;
  isBuiltin: boolean; userCount: number; pages: string[];
};
type User = { id: number; email: string; role: string; disabled_at: string | null };

// Pages the admin role can never lose - the server enforces this too, but
// showing them as locked explains why the checkbox will not move.
const LOCKED_FOR_ADMIN = new Set(["settings", "access_control"]);

export function AccessControlPage() {
  const qc = useQueryClient();
  const { role: myRole } = usePermissions();
  const [draft, setDraft] = useState<Record<string, Set<string>>>({});
  const [toast, setToast] = useState<string | null>(null);
  const [newRoleOpen, setNewRoleOpen] = useState(false);
  const [newRole, setNewRole] = useState({ role: "", label: "" });

  const pagesQ = useQuery({
    queryKey: ["rbac", "pages"],
    queryFn: async () => (await api.get("/rbac/pages")).data as { pages: Page[] },
  });
  const rolesQ = useQuery({
    queryKey: ["rbac", "roles"],
    queryFn: async () => (await api.get("/rbac/roles")).data as { roles: Role[] },
  });
  const usersQ = useQuery({
    queryKey: ["rbac", "users"],
    queryFn: async () => (await api.get("/rbac/users")).data as { users: User[] },
  });

  // Seed the editable draft from the server state.
  useEffect(() => {
    if (!rolesQ.data) return;
    setDraft(Object.fromEntries(rolesQ.data.roles.map((r) => [r.role, new Set(r.pages)])));
  }, [rolesQ.data]);

  const grouped = useMemo(() => {
    const g: Record<string, Page[]> = {};
    for (const p of pagesQ.data?.pages ?? []) (g[p.group] ||= []).push(p);
    return g;
  }, [pagesQ.data]);

  const saveRole = useMutation({
    mutationFn: async (role: string) =>
      (await api.put(`/rbac/roles/${role}/pages`, { pages: Array.from(draft[role] ?? []) })).data,
    onSuccess: (d: any) => {
      setToast(
        d.forcedPages?.length
          ? "Saved. Settings and Roles & Access were kept for admin to prevent lockout."
          : `Access updated for “${d.role}”.`
      );
      qc.invalidateQueries({ queryKey: ["rbac"] });
    },
    onError: (e: any) => setToast(e?.response?.data?.message ?? "Could not save access."),
  });

  const createRole = useMutation({
    mutationFn: async () => (await api.post("/rbac/roles", newRole)).data,
    onSuccess: () => {
      setNewRoleOpen(false);
      setNewRole({ role: "", label: "" });
      setToast("Role created. Tick the pages it should reach, then save.");
      qc.invalidateQueries({ queryKey: ["rbac"] });
    },
    onError: (e: any) => setToast(e?.response?.data?.message ?? "Could not create role."),
  });

  const setUserRole = useMutation({
    mutationFn: async (v: { id: number; role: string }) =>
      (await api.put(`/rbac/users/${v.id}/role`, { role: v.role })).data,
    onSuccess: (d: any) => {
      setToast(d.note ? `Role updated. ${d.note}` : "Role updated.");
      qc.invalidateQueries({ queryKey: ["rbac"] });
    },
    onError: (e: any) => setToast(e?.response?.data?.message ?? "Could not change role."),
  });

  const toggle = (role: string, page: string) => {
    setDraft((d) => {
      const next = new Set(d[role] ?? []);
      next.has(page) ? next.delete(page) : next.add(page);
      return { ...d, [role]: next };
    });
  };

  const dirty = (role: string) => {
    const server = new Set(rolesQ.data?.roles.find((r) => r.role === role)?.pages ?? []);
    const local = draft[role] ?? new Set();
    if (server.size !== local.size) return true;
    for (const k of local) if (!server.has(k)) return true;
    return false;
  };

  if (pagesQ.isLoading || rolesQ.isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>;
  }

  const roles = rolesQ.data?.roles ?? [];

  return (
    <Box sx={pageLayoutSx}>
      <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>Roles &amp; Access</Typography>
          <Typography variant="body2" color="text.secondary">
            Tick the pages each role can open. Unticked pages are hidden from the menu and refused by the API.
          </Typography>
        </Box>
        <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={() => setNewRoleOpen(true)}>
          New role
        </Button>
      </Stack>

      <Alert severity="info">
        Access is enforced in two places: the menu hides what a role cannot reach, and the API
        independently refuses the underlying data — so a hidden page cannot be reached by typing its URL.
        Changes apply immediately, without the user signing out.
      </Alert>

      {/* Permission matrix: pages down, roles across. */}
      <Paper sx={{ ...contentCardSx, p: 0, overflow: "hidden" }}>
        <TableContainer sx={{ maxHeight: 620 }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...tableHeadSx, minWidth: 230 }}>Page</TableCell>
                {roles.map((r) => (
                  <TableCell key={r.role} sx={{ ...tableHeadSx, textAlign: "center", minWidth: 118 }}>
                    <Box>{r.label}</Box>
                    <Box sx={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, opacity: 0.7 }}>
                      {r.userCount} user{r.userCount === 1 ? "" : "s"}
                    </Box>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(grouped).flatMap(([group, pages]) => [
                <TableRow key={`grp-${group}`}>
                  <TableCell
                    colSpan={roles.length + 1}
                    sx={{ ...tableCellSx, bgcolor: "rgba(15,23,42,0.02)", fontSize: 11,
                          textTransform: "uppercase", letterSpacing: "0.06em", color: "text.secondary" }}
                  >
                    {group}
                  </TableCell>
                </TableRow>,
                ...pages.map((p) => (
                  <TableRow key={p.key} hover>
                    <TableCell sx={tableCellSx}>
                      {p.label}
                      <Box component="span" sx={{ ml: 1, fontSize: 11, color: "text.secondary", fontWeight: 500 }}>
                        {p.route}
                      </Box>
                    </TableCell>
                    {roles.map((r) => {
                      const locked = r.role === "admin" && LOCKED_FOR_ADMIN.has(p.key);
                      const checked = draft[r.role]?.has(p.key) ?? false;
                      return (
                        <TableCell key={r.role} sx={{ ...tableCellSx, textAlign: "center" }}>
                          {locked ? (
                            <Tooltip title="Always granted to administrators — prevents locking everyone out of access control.">
                              <span>
                                <Checkbox checked disabled size="small" icon={<LockIcon />} checkedIcon={<LockIcon />} />
                              </span>
                            </Tooltip>
                          ) : (
                            <Checkbox size="small" checked={checked} onChange={() => toggle(r.role, p.key)} />
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        </TableContainer>

        <Stack direction="row" sx={{ p: 1.5, gap: 1, flexWrap: "wrap", alignItems: "center" }}>
          {roles.map((r) => (
            <Button
              key={r.role} size="small"
              variant={dirty(r.role) ? "contained" : "outlined"}
              disabled={!dirty(r.role) || saveRole.isPending}
              onClick={() => saveRole.mutate(r.role)}
            >
              Save {r.label}
              {dirty(r.role) ? " *" : ""}
            </Button>
          ))}
          <Box sx={{ flex: 1 }} />
          <Typography variant="caption" color="text.secondary">
            You are signed in as <strong>{myRole || "unknown"}</strong>
          </Typography>
        </Stack>
      </Paper>

      {/* User -> role assignment */}
      <Paper sx={{ ...contentCardSx, p: 0, overflow: "hidden" }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800, p: 2, pb: 1 }}>User accounts</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={tableHeadSx}>Email</TableCell>
                <TableCell sx={tableHeadSx}>Role</TableCell>
                <TableCell sx={tableHeadSx}>Pages</TableCell>
                <TableCell sx={tableHeadSx}>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(usersQ.data?.users ?? []).map((u) => {
                const r = roles.find((x) => x.role === u.role);
                return (
                  <TableRow key={u.id} hover>
                    <TableCell sx={tableCellSx}>{u.email}</TableCell>
                    <TableCell sx={tableCellSx}>
                      <TextField
                        select size="small" value={u.role}
                        onChange={(e) => setUserRole.mutate({ id: u.id, role: e.target.value })}
                        sx={{ minWidth: 168 }}
                      >
                        {roles.map((x) => <MenuItem key={x.role} value={x.role}>{x.label}</MenuItem>)}
                      </TextField>
                    </TableCell>
                    <TableCell sx={tableCellSx}>{r ? `${r.pages.length} of ${pagesQ.data?.pages.length}` : "—"}</TableCell>
                    <TableCell sx={tableCellSx}>
                      <Chip size="small" variant="outlined"
                            color={u.disabled_at ? "default" : "success"}
                            label={u.disabled_at ? "Disabled" : "Active"} sx={{ height: 22, fontSize: 11 }} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Dialog open={newRoleOpen} onClose={() => setNewRoleOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>New role</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <TextField
              label="Role key" size="small" fullWidth value={newRole.role}
              onChange={(e) => setNewRole((r) => ({ ...r, role: e.target.value.toLowerCase() }))}
              helperText="Lower case, 2-64 chars: a-z 0-9 _ -"
            />
            <TextField
              label="Display name" size="small" fullWidth value={newRole.label}
              onChange={(e) => setNewRole((r) => ({ ...r, label: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewRoleOpen(false)}>Cancel</Button>
          <Button variant="contained" disabled={!newRole.role || createRole.isPending}
                  onClick={() => createRole.mutate()}>
            Create
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={6000} onClose={() => setToast(null)}
                message={toast ?? ""} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
