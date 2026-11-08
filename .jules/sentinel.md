## Sentinel's Journal

## 2024-05-19 - [Missing Rate Limiting on API]
**Vulnerability:** The backend Express API endpoints (`/api/data`, `/api/isolines`) had no request rate limits applied.
**Learning:** An attacker could easily write a loop to spam the API, potentially crashing the server or exhausting resources (Memory, CPU, bandwidth) and causing a Denial of Service (DoS), especially given the heavy turf.js geographical calculations on the server.
**Prevention:** Implementing a lightweight, in-memory rate limiting middleware on the Express server ensures no single IP can make an excessive number of requests in a given timeframe.

## 2024-05-18 - [Exposed Mapbox Access Token]
**Vulnerability:** A Mapbox access token is hardcoded in index.html (mapboxgl.accessToken).
**Learning:** Hardcoded access tokens on frontend clients allow anyone viewing the source code to steal the token and use it to consume the API quota, leading to a potential denial of wallet/service.
**Prevention:** In this specific application architecture, since it's a simple HTML file without a bundler to inject environment variables, the best approach might be to serve the token from the backend API or ensure the token is restricted (e.g., restricted by URL referrers) in the mapbox console. Since we can't control the Mapbox console from code, providing an endpoint to fetch the token is a more secure programmatic approach, although in a static HTML it still needs to be fetched and stored in memory. Alternatively, we could inject the token using a template engine on the server if it was served by Express, but it seems to be statically served. Let's see how index.html is served.
