/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BEY_AGENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
