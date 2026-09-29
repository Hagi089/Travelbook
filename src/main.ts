import { isNativeAndroid } from "./platform";

const app = document.getElementById("app");
if (app) {
  app.textContent = `GPX Tracker – Phase 1 Gerüst (${isNativeAndroid() ? "Android nativ" : "Web/PWA"})`;
}
