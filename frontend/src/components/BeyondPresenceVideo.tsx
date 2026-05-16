"use client";

import { useEffect, useState } from "react";
import { useCardStore } from "../store/useCardStore";

export default function BeyondPresenceVideo() {
  const mode = useCardStore((state) => state.mode);
  const [isTyping, setIsTyping] = useState(false);
  const [sentiment, setSentiment] = useState("neutral");
  const [background, setBackground] = useState("default_classroom");

  // 1. Idle Animations (Empathetic Listening)
  // Detects when the user is typing/interacting to prevent a "frozen" look
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    
    const handleInteraction = () => {
      setIsTyping(true);
      // TODO: Call BeyondPresence SDK to trigger "head tilt" or "nod" animation here
      // bp.triggerAnimation("empathetic_listen");
      
      clearTimeout(timeout);
      timeout = setTimeout(() => setIsTyping(false), 2000);
    };

    window.addEventListener("keydown", handleInteraction);
    window.addEventListener("mousedown", handleInteraction);
    
    return () => {
      window.removeEventListener("keydown", handleInteraction);
      window.removeEventListener("mousedown", handleInteraction);
      clearTimeout(timeout);
    };
  }, []);

  // 2. Dynamic Personas based on Mode
  const getPersona = () => {
    switch (mode) {
      case "teach": return "Formal Professor";
      case "summary": return "Concise Assistant";
      case "quiz": return "Encouraging Coach";
      case "simple": return "Friendly Guide";
      default: return "AI Tutor";
    }
  };

  // 3. Mock Backend Listener (Member 1 & 3 will send these messages)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Listen for Sentiment logic from FastAPI (Member 3)
      if (event.data?.type === "SENTIMENT_UPDATE") {
        setSentiment(event.data.sentiment); 
        // TODO: Call BeyondPresence SDK to trigger micro-expression
        // bp.setExpression(event.data.sentiment);
      }
      // Listen for Contextual Background updates (Member 1 scraping)
      if (event.data?.type === "CONTEXT_UPDATE") {
        setBackground(event.data.background); 
        // TODO: Call BeyondPresence SDK to change background
        // bp.setBackground(event.data.background);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // TODO: Initialize real Beyond Presence SDK here
  /*
  useEffect(() => {
    const initBP = async () => {
      await BeyondPresence.initialize({ streamContainer: "#bp-video-container" });
    };
    initBP();
  }, []);
  */

  return (
    <div 
      id="bp-video-container"
      className="relative w-full h-64 bg-slate-900 flex-shrink-0 flex flex-col items-center justify-center overflow-hidden border-b-4 border-blue-500 transition-colors duration-500"
      style={{ borderColor: isTyping ? '#4ade80' : '#3b82f6' }}
    >
      {/* Mock Video Stream Background (To simulate Contextual Backgrounds) */}
      <div 
        className="absolute inset-0 opacity-40 bg-cover bg-center transition-all duration-1000" 
        style={{ 
          backgroundImage: background === 'laboratory' 
            ? "url('https://images.unsplash.com/photo-1532094349884-543bc11b234d?q=80&w=1000&auto=format&fit=crop')"
            : "url('https://images.unsplash.com/photo-1524169358666-79f22534bc6e?q=80&w=1000&auto=format&fit=crop')" 
        }}
      />
      
      {/* Mock Avatar UI */}
      <div className="z-10 flex flex-col items-center">
        <div className={`w-20 h-20 rounded-full border-4 flex items-center justify-center text-4xl mb-2 transition-all duration-500 shadow-lg bg-slate-800 ${isTyping ? 'border-green-400 scale-105' : 'border-blue-500'}`}>
          {sentiment === 'empathetic' ? '🥺' : sentiment === 'happy' ? '😊' : '🤖'}
        </div>
        <h2 className="text-white font-bold drop-shadow-md">{getPersona()}</h2>
        
        <div className="flex flex-wrap justify-center gap-2 mt-3 text-[10px] uppercase tracking-wider font-semibold">
          <span className="bg-black/60 text-white px-2 py-1 rounded backdrop-blur-sm">
            State: <span className={isTyping ? "text-green-400" : "text-blue-400"}>{isTyping ? "Listening (Head Tilt)" : "Idle"}</span>
          </span>
          <span className="bg-black/60 text-white px-2 py-1 rounded backdrop-blur-sm">
            Expr: <span className="text-yellow-400">{sentiment}</span>
          </span>
          <span className="bg-black/60 text-white px-2 py-1 rounded backdrop-blur-sm">
            BG: <span className="text-purple-400">{background}</span>
          </span>
        </div>
      </div>

      <div className="absolute bottom-2 right-2 text-[9px] text-white/40 uppercase tracking-widest">
        Beyond Presence Stream
      </div>
    </div>
  );
}
