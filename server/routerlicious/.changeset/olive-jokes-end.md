---
"@fluidframework/server-routerlicious-base": minor
---

Added the startup probe as a resource for Alfred, Nexus and Riddler

The startup probe was intended to be a singleton. However, this caused issues between Historian and Routerlicious. To ensure no weird compatability issues arise, this singleton implementation has been removed.
