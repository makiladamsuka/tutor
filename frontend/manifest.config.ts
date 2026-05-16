import { defineManifest } from "@crxjs/vite-plugin";

export default defineManifest({
  manifest_version: 3,
  name: "TutorStream",
  version: "1.0.0",
  description: "Beyond Presence AI Tutor Extension",
  permissions: ["sidePanel", "activeTab", "scripting", "tabs"],
  host_permissions: [
    "<all_urls>",
    "http://localhost:8000/*",
    "http://127.0.0.1:8000/*",
  ],
  side_panel: {
    default_path: "src/sidepanel/index.html",
  },
  action: {
    default_title: "Open TutorStream",
  },
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: ["http://*/*", "https://*/*"],
      js: ["src/content/index.ts"],
      run_at: "document_idle",
    },
  ],
});
