## 2024-05-24 - Escape key for closing overlays
**Learning:** Adding visual hints (like "(Esc)") to close buttons makes keyboard shortcuts discoverable, while the actual `keydown` event listener ensures the shortcut works, significantly improving accessibility and UX for overlay panels like menus and charts.
**Action:** Always pair visual keyboard shortcut hints (in title/aria-label) with the programmatic implementation (event listener) for any closable overlay/panel to ensure discoverability and accessibility.
