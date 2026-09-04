import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/style.css";

/* NOTE: <StrictMode> is intentionally omitted. In dev it mounts every effect
   twice, which builds the entire WebGL hero scene (point cloud, globe,
   PMREM environment, bloom targets) twice per mount/HMR cycle — a real
   GPU/CPU heat spike on the target hardware. The scenes already dispose
   cleanly on unmount, so StrictMode's remount check buys nothing here.
   (Production builds are unaffected either way.) */
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
