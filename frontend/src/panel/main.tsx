import { createRoot } from "react-dom/client";
import ExtensionPanel from "./ExtensionPanel";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Panel root element #root not found");
}

createRoot(root).render(
  <div className="panel">
    <h1>TutorStream</h1>
    <ExtensionPanel />
  </div>
);
