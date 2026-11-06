## 2026-11-06 - Pre-computation over redundant recalculation
**Learning:** Frontend interactions that trigger filters over thousands of objects can suffer heavily if calculations (like string parsing) are executed in the filter loop.
**Action:** Always pre-compute and cache derived values directly on the data object upon fetch/load, if they don't change and are frequently filtered against on render.
