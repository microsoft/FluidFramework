---
"@fluidframework/server-lambdas": minor
---

Added a new event - `dispose` - which is triggered when `.dispose()` is called

This event is triggered when disposing factory resources. It can be used to trigger other graceful shutdown methods.
