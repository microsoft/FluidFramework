---
"@fluidframework/presence": minor
---
---
"section": feature
---

Local value changes in presence now raise events

The [presence value managers](https://fluidframework.com/docs/build/presence#value-managers) now raise events for local
value changes. The new events are as follows:

- LatestValueManager
  - `localUpdated` raised when `local` is assigned

- LatestMapValueManager
  - `localItemUpdated` raised when `local.set` is called
  - `localItemRemoved` raised when `local.delete` is called
