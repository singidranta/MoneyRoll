/// <reference types="vite/client" />

// Описываем наши собственные env-переменные.
interface ImportMetaEnv {
  readonly VITE_MR_MODE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
