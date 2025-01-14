---
"@fluidframework/telemetry-utils": minor
---
---
"section": legacy
---

MockLogger has been removed from the alpha+legacy API surface

The `MockLogger` class previously exposed in the alpha+legacy API surface of `@fluidframework/telemetry-utils` has
been removed.
No replacement is provided, as this class was only intended for use in testing scenarios, and should be trivial to
re-implement in any codebase that still uses it.
