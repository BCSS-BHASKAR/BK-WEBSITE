import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, MenuItem, Paper,
  Snackbar, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import PersonAddAltIcon from "@mui/icons-material/PersonAddAlt";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import VerifiedUserIcon from "@mui/icons-material/VerifiedUser";
import { api } from "../../lib/api";
import { contentCardSx } from "../../lib/uiSurfaces";
import { tableCellSx, tableHeadSx } from "../monitoring/monitoringTokens";
import { usePermissions } from "../../lib/permissions";

type Page = { key: string; label: string; group: string; route: string };
type User = {
  id: number; email: string; role: "admin" | "user";
  disabledAt: string | null; mustChangePassword: boolean; pages: string[];
};

/**
 * Page selection checkboxes, grouped by section.
 *
 * Administrators are not shown a selection - they hold every page implicitly,
 * so ticking boxes for them would imply a choice that does not exist.
 */
function PagePicker({
  pages, selected, onToggle, onBulk, disabled,
}: {
  pages: Page[];
  selected: Set<string>;
  onToggle: (key: string) => void;
  onBulk: (keys: string[], on: boolean) => void;
  disabled?: boolean;
}) {
  const grouped = useMemo(() => {
    const g: Record<string, Page[]> = {};
    for (const p of pages) (g[p.group] ||= []).push(p);
    return g;
  }, [pages]);

  return (
    <Box>
      {Object.entries(grouped).map(([group, list]) => {
        const keys = list.map((p) => p.key);
        const all = keys.every((k) => selected.has(k));
        return (
          <Box key={group} sx={{ mb: 1.5 }}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Typography
                variant="caption"
                sx={{ fontWeight: 800, letterSpacing: "0.07em", textTransform: "uppercase", color: "text.secondary" }}
              >
                {group}
              </Typography>
              <Button size="small" disabled={disabled} onClick={() => onBulk(keys, !all)}>
                {all ? "Clear" : "Select all"}
              </Button>
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 0 }}>
              {list.map((p) => (
                <FormControlLabel
                  key={p.key}
                  disabled={disabled}
                  control={
                    <Checkbox size="small" checked={selected.has(p.key)} onChange={() => onToggle(p.key)} />
                  }
                  label={
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.label}</Typography>
                      <Typography variant="caption" color="text.secondary">{p.route}</Typography>
                    </Box>
                  }
                  sx={{ alignItems: "flex-start", mr: 0, py: 0.25 }}
                />
              ))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

export function RbacPanel() {
  const qc = useQueryClient();
  const { role: myRole } = usePermissions();
  const [toast, setToast] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({
    email: "", password: "", role: "user" as "admin" | "user", mustChangePassword: true,
  });
  const [formPages, setFormPages] = useState<Set<string>>(new Set());

  const [editUser, setEditUser] = useState<User | null>(null);
  const [editPages, setEditPages] = useState<Set<string>>(new Set());
  const [pwUser, setPwUser] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const pagesQ = useQuery({
    queryKey: ["rbac", "pages"],
    queryFn: async () => (await api.get("/rbac/pages")).data as { pages: Page[] },
  });
  const usersQ = useQuery({
    queryKey: ["rbac", "users"],
    queryFn: async () => (await api.get("/rbac/users")).data as { users: User[] },
  });

  useEffect(() => {
    if (editUser) setEditPages(new Set(editUser.pages));
  }, [editUser]);

  const allPages = pagesQ.data?.pages ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["rbac"] });
  const fail = (e: any) => setToast(e?.response?.data?.message ?? "Something went wrong.");

  const createUser = useMutation({
    mutationFn: async () =>
      (await api.post("/rbac/users", { ...form, pages: Array.from(formPages) })).data,
    onSuccess: (d: any) => {
      setAddOpen(false);
      setForm({ email: "", password: "", role: "user", mustChangePassword: true });
      setFormPages(new Set());
      setToast(`${d.email} created with access to ${d.pages.length} page${d.pages.length === 1 ? "" : "s"}.`);
      refresh();
    },
    onError: fail,
  });

  const savePages = useMutation({
    mutationFn: async () =>
      (await api.put(`/rbac/users/${editUser!.id}/pages`, { pages: Array.from(editPages) })).data,
    onSuccess: () => { setEditUser(null); setToast("Access updated. It applies immediately."); refresh(); },
    onError: fail,
  });

  const setRole = useMutation({
    mutationFn: async (v: { id: number; role: string }) =>
      (await api.put(`/rbac/users/${v.id}/role`, { role: v.role })).data,
    onSuccess: (d: any) => { setToast(d.note || "Role updated."); refresh(); },
    onError: fail,
  });

  const setStatus = useMutation({
    mutationFn: async (v: { id: number; disabled: boolean }) =>
      (await api.put(`/rbac/users/${v.id}/status`, { disabled: v.disabled })).data,
    onSuccess: () => { setToast("Account status updated."); refresh(); },
    onError: fail,
  });

  const resetPassword = useMutation({
    mutationFn: async () =>
      (await api.put(`/rbac/users/${pwUser!.id}/password`, { password: newPassword })).data,
    onSuccess: (d: any) => { setPwUser(null); setNewPassword(""); setToast(d.note || "Password reset."); },
    onError: fail,
  });

  const toggleIn = (set: Set<string>, setter: (s: Set<string>) => void) => (key: string) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };
  const bulkIn = (set: Set<string>, setter: (s: Set<string>) => void) => (keys: string[], on: boolean) => {
    const next = new Set(set);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    setter(next);
  };

  if (pagesQ.isLoading || usersQ.isLoading) {
    return <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}><CircularProgress /></Box>;
  }
  const users = usersQ.data?.users ?? [];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2.5 }}>
      <Stack direction="row" sx={{ alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>Role-based access control</Typography>
          <Typography variant="body2" color="text.secondary">
            Add a user and tick the pages they can open. Administrators always have everything.
          </Typography>
        </Box>
        <Button variant="contained" size="small" startIcon={<PersonAddAltIcon />} onClick={() => setAddOpen(true)}>
          Add user
        </Button>
      </Stack>

      <Alert severity="info">
        Access is enforced twice: the menu hides what an account cannot reach, and the API independently
        refuses the underlying data — so a hidden page cannot be reached by typing its URL. Changes apply
        immediately, without the user signing out.
      </Alert>

      <Paper sx={{ ...contentCardSx, p: 0, overflow: "hidden" }}>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={tableHeadSx}>Email</TableCell>
                <TableCell sx={tableHeadSx}>Role</TableCell>
                <TableCell sx={tableHeadSx}>Pages they can open</TableCell>
                <TableCell sx={tableHeadSx}>Status</TableCell>
                <TableCell sx={{ ...tableHeadSx, textAlign: "right" }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} hover>
                  <TableCell sx={tableCellSx}>{u.email}</TableCell>
                  <TableCell sx={tableCellSx}>
                    <TextField
                      select size="small" value={u.role} sx={{ minWidth: 150 }}
                      onChange={(e) => setRole.mutate({ id: u.id, role: e.target.value })}
                    >
                      <MenuItem value="admin">Administrator</MenuItem>
                      <MenuItem value="user">User</MenuItem>
                    </TextField>
                  </TableCell>
                  <TableCell sx={tableCellSx}>
                    {u.role === "admin" ? (
                      <Chip size="small" color="warning" variant="outlined" icon={<VerifiedUserIcon />}
                            label="All pages" sx={{ height: 22, fontSize: 11 }} />
                    ) : (
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
                        {u.pages.length === 0 && (
                          <Typography variant="caption" color="error">No pages — cannot see anything</Typography>
                        )}
                        {u.pages.slice(0, 4).map((k) => (
                          <Chip key={k} size="small" variant="outlined" sx={{ height: 20, fontSize: 10 }}
                                label={allPages.find((p) => p.key === k)?.label ?? k} />
                        ))}
                        {u.pages.length > 4 && (
                          <Chip size="small" sx={{ height: 20, fontSize: 10 }} label={`+${u.pages.length - 4} more`} />
                        )}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell sx={tableCellSx}>
                    <Switch
                      size="small" checked={!u.disabledAt}
                      onChange={(e) => setStatus.mutate({ id: u.id, disabled: !e.target.checked })}
                    />
                    <Typography variant="caption" color="text.secondary">
                      {u.disabledAt ? "Disabled" : "Active"}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ ...tableCellSx, textAlign: "right", whiteSpace: "nowrap" }}>
                    <Tooltip title={u.role === "admin" ? "Administrators always have every page" : "Choose pages"}>
                      <span>
                        <IconButton size="small" disabled={u.role === "admin"} onClick={() => setEditUser(u)}>
                          <EditOutlinedIcon fontSize="small" />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="Reset password">
                      <IconButton size="small" onClick={() => setPwUser(u)}>
                        <KeyOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", p: 1.5 }}>
          Signed in as <strong>{myRole}</strong>. {users.filter((u) => u.role === "admin").length} administrator(s).
        </Typography>
      </Paper>

      {/* Add user - role and page selection happen together */}
      <Dialog open={addOpen} onClose={() => setAddOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add user</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            <TextField
              label="Email" size="small" fullWidth autoComplete="off" value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
            <TextField
              label="Temporary password" size="small" fullWidth type="text" autoComplete="new-password"
              value={form.password} helperText="At least 8 characters."
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <TextField
              select label="Role" size="small" fullWidth value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as "admin" | "user" }))}
              helperText={
                form.role === "admin"
                  ? "Administrators have every page, including user administration."
                  : "Tick the pages this account can open."
              }
            >
              <MenuItem value="user">User</MenuItem>
              <MenuItem value="admin">Administrator</MenuItem>
            </TextField>
            <FormControlLabel
              control={
                <Checkbox size="small" checked={form.mustChangePassword}
                          onChange={(e) => setForm((f) => ({ ...f, mustChangePassword: e.target.checked }))} />
              }
              label={<Typography variant="body2">Require a password change at first sign-in</Typography>}
            />
            <Divider />
            {form.role === "admin" ? (
              <Alert severity="warning" icon={<VerifiedUserIcon />}>
                Administrators automatically have every page. There is nothing to select.
              </Alert>
            ) : (
              <PagePicker
                pages={allPages} selected={formPages}
                onToggle={toggleIn(formPages, setFormPages)}
                onBulk={bulkIn(formPages, setFormPages)}
              />
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={
              createUser.isPending || !form.email || form.password.length < 8 ||
              (form.role === "user" && formPages.size === 0)
            }
            onClick={() => createUser.mutate()}
          >
            {createUser.isPending ? "Creating…" : "Create user"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit an existing user's pages */}
      <Dialog open={Boolean(editUser)} onClose={() => setEditUser(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Pages for {editUser?.email}</DialogTitle>
        <DialogContent dividers>
          <PagePicker
            pages={allPages} selected={editPages}
            onToggle={toggleIn(editPages, setEditPages)}
            onBulk={bulkIn(editPages, setEditPages)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditUser(null)}>Cancel</Button>
          <Button variant="contained" disabled={savePages.isPending} onClick={() => savePages.mutate()}>
            Save access
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(pwUser)} onClose={() => setPwUser(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {pwUser?.email} will be signed out everywhere and asked to set a new password.
          </Typography>
          <TextField
            label="New password" size="small" fullWidth value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)} helperText="At least 8 characters."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPwUser(null)}>Cancel</Button>
          <Button variant="contained" disabled={newPassword.length < 8 || resetPassword.isPending}
                  onClick={() => resetPassword.mutate()}>
            Reset
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={Boolean(toast)} autoHideDuration={6000} onClose={() => setToast(null)}
                message={toast ?? ""} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </Box>
  );
}
