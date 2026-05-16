"use client";

import { useCardStore } from "../store/useCardStore";
import Card from "../components/Card";

export default function KnowledgeBoard() {
  const cards = useCardStore((state) => state.cards);

  return (
    <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-gray-800">Knowledge Board</h2>
        <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{cards.length} Cards</span>
      </div>
      
      <div className="flex flex-col gap-4">
        {cards.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm border-2 border-dashed border-gray-200 rounded-xl">
            No cards generated yet. <br/> Start learning to see notes here!
          </div>
        ) : (
          cards.map((card) => (
            <Card key={card.id} card={card} />
          ))
        )}
      </div>
    </div>
  );
}
