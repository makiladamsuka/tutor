import Controls from "@/components/Controls";
import KnowledgeBoard from "@/components/KnowledgeBoard";
import BeyondPresenceVideo from "@/components/BeyondPresenceVideo";
import ExtensionListener from "@/components/ExtensionListener";

export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 w-full">
      {/* Background Listener for Chrome Extension Messages */}
      <ExtensionListener />

      {/* 1. Video Container (Top) */}
      <BeyondPresenceVideo />

      {/* 2. Control Toggles */}
      <Controls />

      {/* 3. Knowledge Board (Bottom, Scrollable) */}
      <KnowledgeBoard />
    </div>
  );
}
