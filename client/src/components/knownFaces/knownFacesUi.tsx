import type { ReactNode } from "react";
import { Box, Button, Chip, Typography } from "@mui/material";
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import PhotoCameraOutlinedIcon from "@mui/icons-material/PhotoCameraOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { SegmentTabBar } from "../SegmentTabBar";
import { contentCardSx } from "../../lib/uiSurfaces";
import { pnp } from "../../lib/pnpTheme";

export type KnownFacesTab = "enroll" | "search";

export function KnownFacesTabBar({
  active,
  onChange,
}: {
  active: KnownFacesTab;
  onChange: (tab: KnownFacesTab) => void;
}) {
  const tabs: { id: KnownFacesTab; label: string; icon: ReactNode }[] = [
    { id: "enroll", label: "Enroll", icon: <PersonAddAltOutlinedIcon sx={{ fontSize: 18 }} /> },
    { id: "search", label: "Search", icon: <SearchOutlinedIcon sx={{ fontSize: 18 }} /> },
  ];

  return <SegmentTabBar active={active} onChange={onChange} tabs={tabs} ariaLabel="Known faces mode" />;
}

export function KnownFacesSectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1.5, alignItems: "flex-start", minWidth: 0 }}>
      <Box
        sx={{
          width: 44,
          height: 44,
          borderRadius: "10px",
          bgcolor: pnp.primarySoft,
          color: pnp.primary,
          display: "grid",
          placeItems: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0, pt: 0.15 }}>
        <Typography sx={{ fontWeight: 800, fontSize: "1.0625rem", lineHeight: 1.25 }}>{title}</Typography>
        {subtitle ? (
          <Typography sx={{ color: "text.secondary", fontSize: "0.8125rem", mt: 0.35, lineHeight: 1.45 }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

export function KnownFacesCountBadge({ label }: { label: string }) {
  return (
    <Chip
      size="small"
      label={label}
      sx={{
        height: 28,
        fontWeight: 700,
        fontSize: "0.75rem",
        bgcolor: "rgba(15, 23, 42, 0.06)",
        color: "text.secondary",
        border: "none",
        flexShrink: 0,
      }}
    />
  );
}

export function KnownFacesPhotoUpload({
  previewUrl,
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  fileInputRef,
  cameraInputRef,
  onFileSelect,
  helperText = "Drag and drop an image, or choose a file or camera",
}: {
  previewUrl: string | null;
  dragOver: boolean;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  cameraInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (file: File | null) => void;
  helperText?: string;
}) {
  return (
    <Box
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      sx={{
        border: `2px dashed ${dragOver ? pnp.primary : "rgba(15, 23, 42, 0.14)"}`,
        borderRadius: "12px",
        p: { xs: 2, sm: 2.5 },
        minHeight: { xs: 200, sm: 220 },
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        bgcolor: dragOver ? "rgba(37, 99, 235, 0.03)" : "rgba(15, 23, 42, 0.015)",
        mb: 2,
      }}
    >
      {previewUrl ? (
        <Box
          component="img"
          src={previewUrl}
          alt="Preview"
          sx={{
            maxWidth: "100%",
            maxHeight: 160,
            borderRadius: "8px",
            objectFit: "contain",
            mb: 1.5,
          }}
        />
      ) : (
        <Box
          sx={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            bgcolor: "rgba(15, 23, 42, 0.05)",
            display: "grid",
            placeItems: "center",
            mb: 1.25,
          }}
        >
          <CloudUploadOutlinedIcon sx={{ fontSize: 28, color: "text.disabled" }} />
        </Box>
      )}
      <Typography sx={{ fontSize: "0.875rem", color: "text.secondary", mb: 1.5, maxWidth: 280 }}>
        {helperText}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center" }}>
        <Button
          variant="outlined"
          component="label"
          size="small"
          startIcon={<CloudUploadOutlinedIcon />}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Choose file
          <input
            ref={fileInputRef}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
          />
        </Button>
        <Button
          variant="outlined"
          component="label"
          size="small"
          startIcon={<PhotoCameraOutlinedIcon />}
          sx={{ textTransform: "none", fontWeight: 600 }}
        >
          Camera
          <input
            ref={cameraInputRef}
            hidden
            type="file"
            accept="image/*"
            capture="user"
            onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
          />
        </Button>
      </Box>
    </Box>
  );
}

export function KnownFacesEmptyState({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Box sx={{ textAlign: "center", py: { xs: 4, sm: 6 }, px: 2 }}>
      <Box
        sx={{
          width: 72,
          height: 72,
          borderRadius: "50%",
          bgcolor: "rgba(15, 23, 42, 0.05)",
          display: "grid",
          placeItems: "center",
          mx: "auto",
          mb: 1.5,
          color: "text.disabled",
        }}
      >
        {icon}
      </Box>
      <Typography sx={{ fontWeight: 700, fontSize: "1rem" }}>{title}</Typography>
      <Typography sx={{ color: "text.secondary", mt: 0.5, fontSize: "0.875rem", maxWidth: 320, mx: "auto" }}>
        {subtitle}
      </Typography>
    </Box>
  );
}

export const knownFacesPanelSx = {
  ...contentCardSx,
  height: "100%",
  display: "flex",
  flexDirection: "column" as const,
};

export const knownFacesDateToggleSx = {
  display: "flex",
  flexWrap: "wrap",
  gap: 0.75,
  mb: 2,
  "& .MuiToggleButtonGroup-grouped": {
    border: "1px solid rgba(15, 23, 42, 0.12) !important",
    borderRadius: "999px !important",
    mx: 0,
    px: 1.5,
    py: 0.55,
    fontWeight: 700,
    fontSize: "0.8125rem",
    textTransform: "none" as const,
    color: "text.secondary",
    "&.Mui-selected": {
      bgcolor: `${pnp.primary} !important`,
      color: "#fff !important",
    },
  },
};
