## 2024-03-22 - [Mapbox Filtering Optimization]
**Learning:** Filtering a large array of points directly on the client multiple times during every state change (slider movement, toggle layer) can cause noticeable UI lag, especially as the dataset grows.
**Action:** Replace sequential array `.filter()` passes with O(1) lookups by pre-grouping data during initialization. Ensure that initialization routines correctly reset cached dictionaries to avoid state leakage if the initial load is re-triggered without a page refresh.
## 2025-02-12 - Reusing Chart.js instances for smoother timeline scrubbing
**Learning:** In a UI where charts update frequently based on a timeline slider, calling `chart.destroy()` and creating a `new Chart(...)` on every state change causes significant layout thrashing, forces JS garbage collection, and creates main-thread blocking, leading to visual lag.
**Action:** Instead of destroying and recreating charts, update the `chart.data` and `chart.options` in place, then call `chart.update('none')` to skip animations. This provides a much smoother UI experience during rapid updates like timeline scrubbing.
## 2025-02-28 - [Mapbox style updates memoization]
**Learning:** During timeline scrubbing in Mapbox, updating layout and paint properties that haven't actually changed causes expensive WebGL shader invalidations and DOM thrashing (in the legend), severely impacting framerate.
**Action:** Always memoize Mapbox `setLayoutProperty`, `setPaintProperty` and associated heavy DOM updates based on a derived state key if only the underlying data layer is expected to change during an interaction (like a timeline slider).
## 2025-03-24 - [Avoid recalculating static derived state during UI scrubbing]
**Learning:** Frequent UI events, such as scrubbing a timeline slider, often trigger widespread update routines that inadvertently recalculate static data (like filtering large point arrays, parsing strings, and date sorting) causing noticeable frame drops and lag.
**Action:** When a UI component updates continuously based on a rapid interaction, identify static historical data in the calculation path and memoize it. Use specific caching keys (like station ID and horizon) to compute derived arrays only once and retrieve them instantly during rapid state changes.
## 2025-05-18 - [Mapbox GeoJSON Source Optimization]
**Learning:** Calling `setData` on a Mapbox GeoJSON source unconditionally during stylistic UI changes (like toggling parameter labels or interacting with controls) forces expensive internal re-parsing and rebuilding of worker tiles, causing main-thread blocking and layout thrashing.
**Action:** When a UI interaction primarily updates stylistic layers, wrap Mapbox `source.setData()` calls in a conditional block (memoization) to ensure they are only executed when the actual data-defining state properties (e.g., year, season, horizon) change.
