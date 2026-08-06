import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import FaceRetouchingNaturalOutlinedIcon from "@mui/icons-material/FaceRetouchingNaturalOutlined";
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { pageLayoutSx } from "../lib/uiSurfaces";
import { FaceSearchTab } from "../components/knownFaces/FaceSearchTab";
import {
  KnownFacesCountBadge,
  KnownFacesEmptyState,
  KnownFacesPhotoUpload,
  KnownFacesSectionHeader,
  KnownFacesTabBar,
  knownFacesPanelSx,
} from "../components/knownFaces/knownFacesUi";
import {
  createEnroll,
  deleteEnroll,
  fetchEnrollList,
  formatEnrollDate,
  formatQuality,
  mapWalkingError,
  walkingImageUrl,
  type EnrollItem,
} from "../lib/walkingEnrollApi";

function EnrolledCard({
  item,
  onView,
  onDelete,
}: {
  item: EnrollItem;
  onView: (item: EnrollItem) => void;
  onDelete: (item: EnrollItem) => void;
}) {
  const thumbUrl = walkingImageUrl(item.face_crop_path || item.source_path);

  return (
    <Paper sx={{ ...knownFacesPanelSx, p: 1.5 }}>
      <Box
        sx={{
          position: "relative",
          borderRadius: "8px",
          overflow: "hidden",
          bgcolor: "rgba(15,23,42,0.04)",
          aspectRatio: "1 / 1",
          mb: 1.25,
        }}
      >
        {thumbUrl ? (
          <Box
            component="img"
            src={thumbUrl}
            alt={item.name}
            sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <Box sx={{ width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
            <FaceRetouchingNaturalOutlinedIcon sx={{ fontSize: 40, color: "text.disabled" }} />
          </Box>
        )}
      </Box>
      <Typography sx={{ fontWeight: 800, fontSize: "1rem", lineHeight: 1.2 }}>{item.name}</Typography>
      <Typography sx={{ fontSize: "0.8125rem", color: "text.secondary", mt: 0.35 }}>
        Quality {formatQuality(item.quality)}
      </Typography>
      <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", mt: 0.25 }}>
        {formatEnrollDate(item.created_at)}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.5, mt: "auto", pt: 1.25 }}>
        <Button size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon />} onClick={() => onView(item)}>
          Details
        </Button>
        <Tooltip title="Remove">
          <IconButton size="small" color="error" onClick={() => onDelete(item)} aria-label={`Delete ${item.name}`}>
            <DeleteOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Paper>
  );
}

export function KnownFacesPage() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EnrollItem | null>(null);
  const [detailItem, setDetailItem] = useState<EnrollItem | null>(null);
  const [activeTab, setActiveTab] = useState<"enroll" | "search">("enroll");

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const listQuery = useQuery({
    queryKey: ["walking", "enroll-list"],
    queryFn: fetchEnrollList,
    retry: 1,
  });

  const enrollMutation = useMutation({
    mutationFn: ({ personName, image }: { personName: string; image: File }) =>
      createEnroll(personName, image),
    onSuccess: (data) => {
      setFormSuccess(`${data.name} was enrolled successfully.`);
      setFormError(null);
      setName("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      queryClient.invalidateQueries({ queryKey: ["walking", "enroll-list"] });
    },
    onError: (err) => {
      setFormSuccess(null);
      setFormError(mapWalkingError(err));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteEnroll(id),
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["walking", "enroll-list"] });
    },
  });

  const handleFileSelect = useCallback((selected: File | null) => {
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      setFormError("Please choose a JPG, PNG, or WebP image.");
      return;
    }
    setFormError(null);
    setFormSuccess(null);
    setFile(selected);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const dropped = event.dataTransfer.files?.[0];
      if (dropped) handleFileSelect(dropped);
    },
    [handleFileSelect]
  );

  const onSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormSuccess(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!file) {
      setFormError("Please upload a clear frontal photo.");
      return;
    }
    setFormError(null);
    enrollMutation.mutate({ personName: name.trim(), image: file });
  };

  const showEmptyGallery = listQuery.isSuccess && listQuery.data.items.length === 0;
  const showGallery = listQuery.isSuccess && listQuery.data.items.length > 0;
  const enrolledCount = listQuery.data?.count ?? 0;

  return (
    <Box sx={pageLayoutSx}>
      <KnownFacesTabBar active={activeTab} onChange={setActiveTab} />

      {activeTab === "search" ? (
        <FaceSearchTab />
      ) : (
        <Grid container spacing={2.5} sx={{ alignItems: "stretch" }}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Paper component="form" onSubmit={onSubmit} sx={knownFacesPanelSx}>
              <KnownFacesSectionHeader
                icon={<PersonAddAltOutlinedIcon />}
                title="Enroll Person"
                subtitle="Add a clear frontal photo and name. Recognized faces will be labeled on live camera captures."
              />

              <Box sx={{ mt: 2.5 }}>
                <TextField
                  fullWidth
                  required
                  label="Name"
                  placeholder="Enter full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  sx={{ mb: 2 }}
                  disabled={enrollMutation.isPending}
                />

                <KnownFacesPhotoUpload
                  previewUrl={previewUrl}
                  dragOver={dragOver}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onDrop}
                  fileInputRef={fileInputRef}
                  cameraInputRef={cameraInputRef}
                  onFileSelect={handleFileSelect}
                />

                {formError && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {formError}
                  </Alert>
                )}
                {formSuccess && (
                  <Alert severity="success" sx={{ mb: 2 }}>
                    {formSuccess}
                  </Alert>
                )}

                <Button
                  type="submit"
                  variant="contained"
                  size="large"
                  fullWidth
                  disabled={enrollMutation.isPending || !name.trim() || !file}
                  startIcon={
                    enrollMutation.isPending ? (
                      <CircularProgress size={18} color="inherit" />
                    ) : (
                      <PersonAddAltOutlinedIcon />
                    )
                  }
                  sx={{ mt: "auto", py: 1.35, fontWeight: 700, textTransform: "none" }}
                >
                  {enrollMutation.isPending ? "Enrolling…" : "Enroll face"}
                </Button>
              </Box>
            </Paper>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Paper sx={knownFacesPanelSx}>
              <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1.5, mb: 0.5 }}>
                <KnownFacesSectionHeader
                  icon={<GroupsOutlinedIcon />}
                  title="Known Faces"
                />
                <KnownFacesCountBadge label={`${enrolledCount} enrolled`} />
              </Box>

              <Box sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {(listQuery.isLoading || listQuery.isFetching) && !listQuery.isError && (
                  <Box sx={{ display: "flex", justifyContent: "center", py: 6, flex: 1 }}>
                    <CircularProgress />
                  </Box>
                )}

                {!listQuery.isLoading && (showEmptyGallery || listQuery.isError) && (
                  <KnownFacesEmptyState
                    icon={<FaceRetouchingNaturalOutlinedIcon sx={{ fontSize: 36 }} />}
                    title="No enrolled faces yet"
                    subtitle="Upload a clear frontal photo to enroll someone."
                  />
                )}

                {showGallery && (
                  <Grid container spacing={1.5} sx={{ mt: 1.5 }}>
                    {listQuery.data.items.map((item) => (
                      <Grid key={item.id} size={{ xs: 12, sm: 6 }}>
                        <EnrolledCard item={item} onView={setDetailItem} onDelete={setDeleteTarget} />
                      </Grid>
                    ))}
                  </Grid>
                )}
              </Box>
            </Paper>
          </Grid>
        </Grid>
      )}

      <Dialog open={!!detailItem && activeTab === "enroll"} onClose={() => setDetailItem(null)} maxWidth="sm" fullWidth>
        {detailItem && (
          <>
            <DialogTitle>{detailItem.name}</DialogTitle>
            <DialogContent>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, mb: 0.5 }}>Face</Typography>
                  <Box
                    component="img"
                    src={walkingImageUrl(detailItem.face_crop_path)}
                    alt={`${detailItem.name} face`}
                    sx={{ width: "100%", borderRadius: "8px", border: "1px solid rgba(15,23,42,0.08)" }}
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Typography sx={{ fontSize: "0.75rem", fontWeight: 700, mb: 0.5 }}>Source photo</Typography>
                  <Box
                    component="img"
                    src={walkingImageUrl(detailItem.source_path)}
                    alt={`${detailItem.name} source`}
                    sx={{ width: "100%", borderRadius: "8px", border: "1px solid rgba(15,23,42,0.08)" }}
                  />
                </Grid>
              </Grid>
              <Box sx={{ mt: 2, display: "grid", gap: 0.75 }}>
                <Typography variant="body2">Quality: {formatQuality(detailItem.quality)}</Typography>
                <Typography variant="body2">Enrolled: {formatEnrollDate(detailItem.created_at)}</Typography>
              </Box>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDetailItem(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={!!deleteTarget && activeTab === "enroll"} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>Remove {deleteTarget?.name}?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This person will no longer be recognized on live camera feeds.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)} disabled={deleteMutation.isPending}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={deleteMutation.isPending}
            onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
          >
            {deleteMutation.isPending ? "Removing…" : "Remove"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
