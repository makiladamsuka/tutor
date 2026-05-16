// This script runs directly ON the website the user is viewing (The "Chrome Page")

console.log("TutorStream Content Script Loaded!");

// Listen for the user highlighting/selecting text on the webpage
document.addEventListener('mouseup', () => {
  const selectedText = window.getSelection().toString().trim();
  
  if (selectedText.length > 0) {
    console.log("Text selected, sending to Side Panel:", selectedText);
    
    // Send the scraped text to the Next.js Side Panel UI
    chrome.runtime.sendMessage({
      type: "SCRAPED_CONTENT",
      text: selectedText
    });
  }
});
