/// <reference types="vite/client" />

declare const __BUILD_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_TELEMETRY_WEBHOOK?: string;
  readonly VITE_BASE_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
