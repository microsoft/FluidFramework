---
"@fluidframework/server-lambdas": major
"@fluidframework/server-routerlicious": major
"@fluidframework/server-routerlicious-base": major
"@fluidframework/server-services-shared": major
---

Added support for Redis graceful shutdown

This PR adds a way to ensure that Redis connections are gracefully shut down when disposing service factory resources.
