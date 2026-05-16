import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface StudyCard {
  id: string;
  type: "teach" | "summary" | "quiz" | "simple";
  title: string;
  content: string;
  user_edits: string;
  timestamp: string;
}

interface CardState {
  cards: StudyCard[];
  mode: "teach" | "summary" | "quiz" | "simple";
  language: "EN" | "SI" | "TA";
  addCard: (card: Omit<StudyCard, "id" | "timestamp">) => void;
  updateCardEdits: (id: string, edits: string) => void;
  setMode: (mode: "teach" | "summary" | "quiz" | "simple") => void;
  setLanguage: (lang: "EN" | "SI" | "TA") => void;
}

export const useCardStore = create<CardState>()(
  persist(
    (set) => ({
      cards: [],
      mode: "teach",
      language: "EN",
      addCard: (card) => set((state) => ({
        cards: [
          {
            ...card,
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString()
          },
          ...state.cards, // Add new cards to the top
        ]
      })),
      updateCardEdits: (id, edits) => set((state) => ({
        cards: state.cards.map(card => 
          card.id === id ? { ...card, user_edits: edits } : card
        )
      })),
      setMode: (mode) => set({ mode }),
      setLanguage: (language) => set({ language })
    }),
    {
      name: 'tutorstream-storage', // unique name for localStorage key
    }
  )
);
