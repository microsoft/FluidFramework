---
"@fluidframework/presence": minor
"__section": feature
---
Latest and LatestMap support more types

- `Latest` (`StateFactory.latest`) permits `null` so that nullable types may be used.
- `LatestMap` (`StateFactory.latestMap`) permits `boolean`, `number`, `string`, and `null`.
