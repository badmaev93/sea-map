## 2024-03-22 - [Mapbox Filtering Optimization]
**Learning:** Filtering a large array of points directly on the client multiple times during every state change (slider movement, toggle layer) can cause noticeable UI lag, especially as the dataset grows.
**Action:** Replace sequential array `.filter()` passes with O(1) lookups by pre-grouping data during initialization. Ensure that initialization routines correctly reset cached dictionaries to avoid state leakage if the initial load is re-triggered without a page refresh.
## 2025-02-12 - Reusing Chart.js instances for smoother timeline scrubbing
**Learning:** In a UI where charts update frequently based on a timeline slider, calling `chart.destroy()` and creating a `new Chart(...)` on every state change causes significant layout thrashing, forces JS garbage collection, and creates main-thread blocking, leading to visual lag.
**Action:** Instead of destroying and recreating charts, update the `chart.data` and `chart.options` in place, then call `chart.update('none')` to skip animations. This provides a much smoother UI experience during rapid updates like timeline scrubbing.
