import type { ConfigContext, ExpoConfig } from "expo/config";

export default function config({ config }: ConfigContext): ExpoConfig {
  return {
    ...config,
    extra: { ...config.extra, cloudApiUrl: process.env.VITE_CLOUD_API_URL }
  };
}
