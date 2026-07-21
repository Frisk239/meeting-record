import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./styles.css";

/** Share docs are public standalone pages — skip session bootstrap entirely. */
function isPublicSharePath(): boolean {
  return /^\/s\/[^/]+/.test(window.location.pathname);
}

const root = createRoot(document.getElementById("root")!);

if (isPublicSharePath()) {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
