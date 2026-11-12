## Sentinel's Journal

## 2024-05-19 - [Missing Rate Limiting on API]
**Vulnerability:** The backend Express API endpoints (`/api/data`, `/api/isolines`) had no request rate limits applied.
**Learning:** An attacker could easily write a loop to spam the API, potentially crashing the server or exhausting resources (Memory, CPU, bandwidth) and causing a Denial of Service (DoS), especially given the heavy turf.js geographical calculations on the server.
**Prevention:** Implementing a lightweight, in-memory rate limiting middleware on the Express server ensures no single IP can make an excessive number of requests in a given timeframe.

## 2024-05-18 - [Exposed Mapbox Access Token]
**Vulnerability:** A Mapbox access token is hardcoded in index.html (mapboxgl.accessToken).
**Learning:** Hardcoded access tokens on frontend clients allow anyone viewing the source code to steal the token and use it to consume the API quota, leading to a potential denial of wallet/service.
**Prevention:** In this specific application architecture, since it's a simple HTML file without a bundler to inject environment variables, the best approach might be to serve the token from the backend API or ensure the token is restricted (e.g., restricted by URL referrers) in the mapbox console. Since we can't control the Mapbox console from code, providing an endpoint to fetch the token is a more secure programmatic approach, although in a static HTML it still needs to be fetched and stored in memory. Alternatively, we could inject the token using a template engine on the server if it was served by Express, but it seems to be statically served. Let's see how index.html is served.
## 2023-10-27 - [Fix DoS and Broken Rate Limiting Behind Proxy]
**Vulnerability:** The custom rate limiting middleware using a `Map` structure was susceptible to memory exhaustion (OOM) via IP spoofing or large number of unique requesters. Also, `req.ip` resolved to proxy IP behind proxies causing rate limit bypass or blanket denial of service. JSON parsing lacked a payload size limit.
**Learning:** Naive in-memory rate limiting without a strict upper bound on tracked entities opens up OOM attack vectors. Express must explicitly trust the proxy to get correct client IPs when deployed in modern hosting environments.
**Prevention:** Cap the size of tracking Maps and evict old entries. Set `trust proxy` correctly in Express when deployed behind proxies. Always configure payload limits on parsing middlewares like `express.json()`.

## 2024-05-24 - [Missing SRI and Version Pinning on CDN Libraries]
**Vulnerability:** External CDN scripts and stylesheets (`mapbox-gl.css`, `mapbox-gl.js`, `chart.js`) in `index.html` were loaded without Subresource Integrity (SRI) hashes and some without pinned versions.
**Learning:** Without SRI, if a CDN is compromised, malicious code could be served to users. Unpinned versions can introduce unexpected breaking changes or vulnerabilities if the library updates automatically.
**Prevention:** Always pin dependencies to specific versions and include `integrity` and `crossorigin="anonymous"` attributes for all external CDN resources to ensure the code remains untampered and predictable.

## 2024-05-25 - [CORS Error Exposed as 500 Internal Server Error]
**Vulnerability:** The Express global error handler was catching CORS errors (e.g. `Not allowed by CORS` from the `cors` middleware) and responding with a `500 Internal Server Error`.
**Learning:** This misconfiguration misrepresents a client-side origin violation as a server failure. An attacker could exploit this by constantly sending invalid origins, flooding logs, and masking legitimate internal server errors.
**Prevention:** Always check error instances in global error handlers and map `CORS` related errors to their proper HTTP Status (`403 Forbidden`).
