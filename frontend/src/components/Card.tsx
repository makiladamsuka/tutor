"use client";

import { useState, useEffect } from "react";
import { StudyCard, useCardStore } from "../store/useCardStore";

export default function Card({ card }: { card: StudyCard }) {
  const updateCardEdits = useCardStore((state) => state.updateCardEdits);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(card.user_edits);

  // Sync internal state if the store updates externally
  useEffect(() => {
    setEditValue(card.user_edits);
  }, [card.user_edits]);

  const handleSave = () => {
    updateCardEdits(card.id, editValue);
    setIsEditing(false);
  };

  const getModeColor = (type: string) => {
    switch (type) {
      case "teach": return "bg-blue-100 text-blue-800";
      case "summary": return "bg-purple-100 text-purple-800";
      case "quiz": return "bg-orange-100 text-orange-800";
      case "simple": return "bg-green-100 text-green-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 transition-all hover:shadow-md">
      <div className="flex items-center justify-between mb-2">
        <span className={`px-2 py-1 text-[10px] uppercase font-bold tracking-wider rounded ${getModeColor(card.type)}`}>
          {card.type}
        </span>
        <span className="text-xs text-gray-400">
          {new Date(card.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      <h3 className="font-semibold text-gray-800 mb-1">{card.title}</h3>
      <p className="text-sm text-gray-600 mb-3">{card.content}</p>
      
      <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100">
        <div className="flex justify-between items-center mb-2">
          <span className="font-semibold text-yellow-800 text-xs uppercase tracking-wide">My Notes</span>
          {!isEditing ? (
            <button 
              onClick={() => setIsEditing(true)}
              className="text-xs text-yellow-700 hover:text-yellow-900 underline"
            >
              Edit
            </button>
          ) : (
            <button 
              onClick={handleSave}
              className="text-xs bg-yellow-200 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-300 font-medium"
            >
              Save
            </button>
          )}
        </div>
        
        {isEditing ? (
          <textarea
            className="w-full text-sm text-gray-700 bg-white border border-yellow-200 rounded p-2 focus:outline-none focus:ring-2 focus:ring-yellow-400 min-h-[60px]"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            placeholder="Add your own notes here..."
            autoFocus
          />
        ) : (
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {card.user_edits || <span className="text-gray-400 italic">No notes added yet. Click edit to add.</span>}
          </p>
        )}
      </div>
    </div>
  );
}
