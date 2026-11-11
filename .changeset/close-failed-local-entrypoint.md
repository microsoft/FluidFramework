---
"@fluidframework/local-driver": minor
"__section": fix
---
Release local-service resources when initialization fails

The alpha local service client now disposes a runtime whose root initialization fails and closes a created or loaded container if resolving its application entry point fails.
The error is still propagated to the caller.
This prevents failed initialization from leaving untracked runtimes, containers, and their timers alive.
