---
"@fluidframework/local-driver": minor
"__section": fix
---
Close local-service containers when entry-point initialization fails

The alpha local service client now closes a newly created or loaded container if resolving its application entry point fails.
The original error is still returned to the caller.
This prevents failed root initialization from leaving untracked containers and their timers alive.
