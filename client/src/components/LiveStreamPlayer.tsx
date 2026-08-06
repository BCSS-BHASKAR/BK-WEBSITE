import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Box, CircularProgress, Typography } from "@mui/material";
import { apiBase } from "../lib/api";
import { getAccessToken } from "../auth/tokenStore";

type Props = {
  streamId: string;

  compact?: boolean;

  muted?: boolean;
  controls?: boolean;
  className?: string;
};

export function LiveStreamPlayer({
  streamId,
  compact = false,
  muted = true,
  controls = false,
  className,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setError(null);
    setLoading(true);
    const video = videoRef.current;
    if (!video) return;

    const playlistUrl = `${apiBase}/streams/${encodeURIComponent(streamId)}/hls/index.m3u8`;
    let cancelled = false;

    const attachWithHlsJs = () => {
      const hls = new Hls({
        liveDurationInfinity: true,
        lowLatencyMode: true,
        maxLiveSyncPlaybackRate: 1.2,
        backBufferLength: 10,
        xhrSetup: (xhr) => {
          const t = getAccessToken();
          if (t) xhr.setRequestHeader("Authorization", `Bearer ${t}`);
        },
      });
      hlsRef.current = hls;
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (cancelled) return;
        setLoading(false);
        video.play().catch(() => {

        });
      });
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (cancelled) return;
        if (data.fatal) {
          setError(data.details || data.type || "fatal_error");
          setLoading(false);
          try { hls.destroy(); } catch {  }
        }
      });
      hls.loadSource(playlistUrl);
      hls.attachMedia(video);
    };

    if (Hls.isSupported()) {
      attachWithHlsJs();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {

      video.src = playlistUrl;
      video.addEventListener("loadeddata", () => setLoading(false), { once: true });
      video.play().catch(() => {  });
    } else {
      setError("hls_unsupported");
      setLoading(false);
    }

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {  }
        hlsRef.current = null;
      }
      try { video.pause(); } catch {  }
      video.removeAttribute("src");
      try { video.load(); } catch {  }
    };
  }, [streamId]);

  return (
    <Box
      className={className}
      sx={{
        position: "relative",
        width: "100%",
        height: "100%",
        bgcolor: "#000000",
        borderRadius: 1.5,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Box
        component="video"
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        controls={controls}
        sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
      />
      {loading ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(0,0,0,0.55)",
            color: "#FFFFFF",
            gap: 1,
          }}
        >
          <CircularProgress size={compact ? 22 : 32} sx={{ color: "#FFFFFF" }} />
          {!compact ? (
            <Typography variant="caption" sx={{ fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
              Connecting to stream...
            </Typography>
          ) : null}
        </Box>
      ) : null}
      {error ? (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            bgcolor: "rgba(127, 29, 29, 0.78)",
            color: "#FFFFFF",
            p: 2,
            textAlign: "center",
          }}
        >
          <Box>
            <Typography sx={{ fontWeight: 900, fontSize: compact ? "0.85rem" : "1rem" }}>
              Stream unavailable
            </Typography>
            {!compact ? (
              <Typography variant="caption" sx={{ display: "block", mt: 0.5, opacity: 0.85 }}>
                {error}
              </Typography>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Box>
  );
}
