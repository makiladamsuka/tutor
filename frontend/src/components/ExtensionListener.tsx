"use client";

import { useEffect } from "react";
import { useCardStore } from "../store/useCardStore";

export default function ExtensionListener() {
  const { addCard, mode } = useCardStore();

  useEffect(() => {
    // Check if we are running inside the Chrome Extension environment
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
      
      const messageListener = (message: any) => {
        // Listen for scraped text from the Chrome Page (content.js)
        if (message.type === "SCRAPED_CONTENT") {
          addCard({
            type: mode, // Uses the currently selected mode (Teach, Summary, etc.)
            title: "Scraped from Page",
            content: message.text,
            user_edits: ""
          });
        }
      };

      // Add the listener
      chrome.runtime.onMessage.addListener(messageListener);

      // Cleanup listener on unmount
      return () => {
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    }
  }, [addCard, mode]);

  return null; // This component doesn't render any UI, it just listens in the background
}
