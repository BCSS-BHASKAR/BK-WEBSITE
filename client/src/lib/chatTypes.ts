export type ChatCard =
  | {
      type: "plate_summary";
      plate: string;
      from: string;
      to: string;
      anprCount: number;
      violationCount: number;
      firstSeen: string | null;
      lastSeen: string | null;
      sites: { cameraId: string; name: string; count: number }[];
    }
  | {
      type: "plate_sightings";
      plate: string;
      rows: {
        id: number;
        plate: string;
        cameraId: string;
        site: string;
        vehicleType: string;
        detectedAt: string;
        fullImageUrl: string;
        thumbnailUrl: string;
      }[];
    }
  | {
      type: "plate_violations";
      plate: string;
      rows: {
        id: number;
        violationType: string;
        score: number;
        detectedAt: string;
        cameraId: string;
        site: string;
        plate: string;
        fullImageUrl: string;
      }[];
    }
  | {
      type: "violation_summary";
      from: string;
      to: string;
      hourFrom?: number | null;
      hourTo?: number | null;
      timeSpansMidnight?: boolean;
      site: string | null;
      cameraId: string | null;
      plate: string | null;
      violationType: string | null;
      total: number;
      byType: Record<string, number>;
    }
  | {
      type: "read_summary";
      from: string;
      to: string;
      hourFrom?: number | null;
      hourTo?: number | null;
      timeSpansMidnight?: boolean;
      site: string | null;
      cameraId: string | null;
      plate: string | null;
      total: number;
    }
  | {
      type: "camera_list";
      cameras: { cameraId: string; name: string; hasStream: boolean }[];
    }
  | {
      type: "violation_type_rank";
      from: string;
      to: string;
      hourFrom?: number | null;
      hourTo?: number | null;
      timeSpansMidnight?: boolean;
      types: { violationType: string; count: number }[];
    }
  | {
      type: "violation_site_rank";
      from: string;
      to: string;
      hourFrom?: number | null;
      hourTo?: number | null;
      timeSpansMidnight?: boolean;
      violationType: string | null;
      sites: { cameraId: string; name: string; count: number }[];
    }
  | {
      type: "read_site_rank";
      from: string;
      to: string;
      sites: { cameraId: string; name: string; count: number }[];
    }
  | {
      type: "operations_summary";
      from: string;
      to: string;
      totalReads: number;
      uniquePlates: number;
      violationCount: number;
      topViolationType: string | null;
      topViolationCount: number;
      busiestReadSite: string | null;
      busiestReadCameraId?: string | null;
      busiestReadCount: number;
      busiestViolationSite: string | null;
      busiestViolationCameraId?: string | null;
      busiestViolationCount: number;
      byType: Record<string, number>;
      display?: {
        title: string;
        reads: string;
        plates: string;
        violations: string;
        leadingType: string;
        mostReads: string;
        highestViolations: string;
      };
    }
  | {
      type: "top_plates";
      from: string;
      to: string;
      plates: { plate: string; count: number }[];
    }
  | {
      type: "metric_count";
      metric: string;
      from: string;
      to: string;
      site: string | null;
      total: number;
    }
  | {
      type: "peak_hour";
      metric: string;
      from: string;
      to: string;
      hour: number | null;
      count: number;
    }
  | {
      type: "vehicle_mix";
      from: string;
      to: string;
      privateCount: number;
      puvCount: number;
      total: number;
    }
  | {
      type: "watchlist_hits";
      from: string;
      to: string;
      total: number;
      samples: { plate: string; listName: string }[];
    }
  | {
      type: "period_compare";
      metric: string;
      todayCount: number;
      yesterdayCount: number;
      delta: number;
      throughHour: number;
    };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  cards?: ChatCard[];
  ts: number;
};

export type ChatApiResponse = {
  sessionId: string;
  message: string;
  cards: ChatCard[];
  context: Record<string, unknown>;
};
