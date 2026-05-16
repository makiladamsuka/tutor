"use client";

import ActivatePanel from "../components/ActivatePanel";

export default function SidePanelPage() {
  return (
    <div className="flex h-screen w-full flex-col bg-slate-900 p-4 text-white">
      <h1 className="text-lg font-semibold">TutorStream</h1>
      <div className="mt-4 flex-1 overflow-y-auto">
        <ActivatePanel />
      </div>
    </div>
  );
}
