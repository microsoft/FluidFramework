---
"@fluidframework/container-loader": minor
"__section": fix
---
Point-in-time load failures now release container resources reliably

Failed point-in-time loads now dispose their temporary containers, including when the container
becomes unavailable during read-only setup or operation replay. Cancellation and lifecycle errors
are preserved while the container resources and event listeners are cleaned up.
