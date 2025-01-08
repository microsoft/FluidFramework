---
"@fluidframework/telemetry-utils": minor
---
---
"section": legacy
---

MockLogger has been removed from the alpha+legacy API surface

The `MockLogger` class, which was previously part of the alpha+legacy API in `@fluidframework/telemetry-utils`, has
been removed.
No replacement is provided. This class was only intended for use in testing scenarios and should be trivial to
re-implement in any codebase that still needs it.
