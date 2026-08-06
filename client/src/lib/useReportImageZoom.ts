import { useCallback, useMemo, useState } from "react";
import type { ImageZoomPayload } from "../components/ImageZoomDialog";

export function useReportImageZoom<T>(
  rows: T[],
  toPayload: (row: T) => ImageZoomPayload | null
) {
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);

  const findAdjacent = useCallback(
    (from: number, dir: 1 | -1): number | null => {
      let i = from + dir;
      while (i >= 0 && i < rows.length) {
        if (toPayload(rows[i])) return i;
        i += dir;
      }
      return null;
    },
    [rows, toPayload]
  );

  const payload = useMemo(() => {
    if (zoomIndex == null) return null;
    return toPayload(rows[zoomIndex]) ?? null;
  }, [rows, zoomIndex, toPayload]);

  const openAt = useCallback(
    (index: number) => {
      if (index >= 0 && index < rows.length && toPayload(rows[index])) {
        setZoomIndex(index);
      }
    },
    [rows, toPayload]
  );

  const close = useCallback(() => setZoomIndex(null), []);

  const goPrevious = useCallback(() => {
    if (zoomIndex == null) return;
    const prev = findAdjacent(zoomIndex, -1);
    if (prev != null) setZoomIndex(prev);
  }, [zoomIndex, findAdjacent]);

  const goNext = useCallback(() => {
    if (zoomIndex == null) return;
    const next = findAdjacent(zoomIndex, 1);
    if (next != null) setZoomIndex(next);
  }, [zoomIndex, findAdjacent]);

  const hasPrevious = zoomIndex != null && findAdjacent(zoomIndex, -1) != null;
  const hasNext = zoomIndex != null && findAdjacent(zoomIndex, 1) != null;

  return {
    open: zoomIndex != null && payload != null,
    payload,
    openAt,
    close,
    goPrevious,
    goNext,
    hasPrevious,
    hasNext,
  };
}
