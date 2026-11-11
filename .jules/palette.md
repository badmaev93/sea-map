## 2024-05-24 - Escape key for closing overlays
**Learning:** Adding visual hints (like "(Esc)") to close buttons makes keyboard shortcuts discoverable, while the actual `keydown` event listener ensures the shortcut works, significantly improving accessibility and UX for overlay panels like menus and charts.
**Action:** Always pair visual keyboard shortcut hints (in title/aria-label) with the programmatic implementation (event listener) for any closable overlay/panel to ensure discoverability and accessibility.

## 2024-05-24 - Semantic labels for custom range sliders
**Learning:** Custom range sliders (like `<input type="range">`) often have values that represent semantic meaning (e.g., years or seasons) rather than simple numeric indices. Without `aria-valuetext`, screen readers announce the meaningless numeric value (e.g., "0", "1", "2").
**Action:** Whenever implementing a custom range slider representing non-numeric data, dynamically update the `aria-valuetext` attribute alongside visual labels to ensure screen readers announce the semantic value.
