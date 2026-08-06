import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export type CameraRegistryRow = { id: string; name: string; hasStream: boolean };

type CamerasResp = {
  cameras: CameraRegistryRow[];
  cameraMap: Record<string, string>;
};

export function useCameras() {
  return useQuery({
    queryKey: ["cameras", "registry"],
    queryFn: async () => (await api.get<CamerasResp>("/dashboard/cameras")).data,
    staleTime: 5 * 60 * 1000,
  });
}
