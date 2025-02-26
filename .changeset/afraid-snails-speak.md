---
"@fluidframework/presence": minor
---
---
"section": feature
---

Events added for local value changes

- LatestValueManager
  - `localUpdated` raised when `local` is assigned

- LatestMapValueManager
  - `localItemUpdated` raised when `local.set` is called
  - `localItemRemoved` raised when `local.delete` is called
