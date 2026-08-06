import { Box, CircularProgress, Dialog, IconButton, Tooltip, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import DownloadOutlinedIcon from "@mui/icons-material/DownloadOutlined";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";

type Props = {
  open: boolean;
  challanId: number | null;
  ticketNo: string;
  onClose: () => void;
};

const modalIconShell = {
  zIndex: 2,
  bgcolor: "rgba(15,23,42,0.72)",
  color: "#fff",
  "&:hover": { bgcolor: "rgba(15,23,42,0.88)" },
};

export function ChallanPdfModal({ open, challanId, ticketNo, onClose }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prevBlobUrl = useRef<string | null>(null);

  useEffect(() => {
    if (prevBlobUrl.current) {
      URL.revokeObjectURL(prevBlobUrl.current);
      prevBlobUrl.current = null;
    }
    setBlobUrl(null);
    setError(null);
    if (!open || challanId == null) return;

    setLoading(true);
    api
      .get<Blob>(`/challan/${challanId}/pdf`, { responseType: "blob" })
      .then(({ data }) => {
        const url = URL.createObjectURL(data);
        prevBlobUrl.current = url;
        setBlobUrl(url);
      })
      .catch(() => setError("Could not generate PDF. Please try again."))
      .finally(() => setLoading(false));

    return () => {
      if (prevBlobUrl.current) {
        URL.revokeObjectURL(prevBlobUrl.current);
        prevBlobUrl.current = null;
      }
    };
  }, [open, challanId]);

  const downloadName = `TCT-${ticketNo}.pdf`;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth slotProps={{ paper: { sx: { borderRadius: 2 } } }}>
      <Box sx={{ position: "relative", p: { xs: 2, sm: 2.5 }, pt: { xs: 5.5, sm: 3 } }}>
        {blobUrl ? (
          <Tooltip title="Download PDF">
            <IconButton
              size="small"
              component="a"
              href={blobUrl}
              download={downloadName}
              sx={{ position: "absolute", top: 8, right: 48, ...modalIconShell }}
            >
              <DownloadOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : null}

        <IconButton onClick={onClose} aria-label="Close" size="small" sx={{ position: "absolute", top: 8, right: 8, ...modalIconShell }}>
          <CloseIcon fontSize="small" />
        </IconButton>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1, pr: 12, mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 900 }}>
            Traffic Citation Ticket
          </Typography>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: "primary.main" }}>
            {ticketNo}
          </Typography>
        </Box>

        <Box
          sx={{
            bgcolor: "#0b1220",
            borderRadius: 2,
            overflow: "hidden",
            height: "75vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {loading ? (
            <CircularProgress sx={{ color: "#fff" }} />
          ) : error ? (
            <Typography sx={{ color: "#94a3b8", fontWeight: 600, fontSize: "0.875rem", px: 3, textAlign: "center" }}>
              {error}
            </Typography>
          ) : blobUrl ? (
            <iframe
              src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=1`}
              title="Traffic Citation Ticket PDF"
              width="100%"
              height="100%"
              style={{ border: "none", display: "block" }}
            />
          ) : null}
        </Box>
      </Box>
    </Dialog>
  );
}
