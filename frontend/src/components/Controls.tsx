"use client";

import { useCardStore } from "../store/useCardStore";

export default function Controls() {
  const { mode, language, setMode, setLanguage, addCard } = useCardStore();

  const modes = [
    { id: "teach", label: "Teach" },
    { id: "summary", label: "Summary" },
    { id: "quiz", label: "Quiz" },
    { id: "simple", label: "Simply" },
  ] as const;

  const languages = [
    { id: "EN", label: "EN" },
    { id: "SI", label: "SI" },
    { id: "TA", label: "TA" },
  ] as const;

  // Temporary helper to test adding cards
  const handleTestAddCard = () => {
    addCard({
      type: mode,
      title: `Test ${mode} Card`,
      content: `This is a generated card for ${mode} mode in ${language}.`,
      user_edits: ""
    });
  };

  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-200 p-3 shadow-sm z-10">
      <div className="flex flex-col gap-3">
        {/* Mode Toggles */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Mode</span>
          <div className="flex gap-2">
            {modes.map((m) => (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  mode === m.id
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Language Toggles */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Language</span>
          <div className="flex gap-2 items-center">
            {languages.map((l) => (
              <button
                key={l.id}
                onClick={() => setLanguage(l.id)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  language === l.id
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {l.label}
              </button>
            ))}
            {/* Temporary button to test state */}
            <button 
              onClick={handleTestAddCard}
              className="ml-2 px-2 py-1 text-[10px] bg-black text-white rounded hover:bg-gray-800"
            >
              + Test Card
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
