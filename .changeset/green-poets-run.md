---
"@fluidframework/presence": minor
"__section": other
---
StateFactory.latest and StateFactory.latestMap now accept a validator parameter

The StateFactory.latest and StateFactory.latestMap APIs now accept a `validator` argument. This argument is
reserved for future use. **Passing the `validator` argument in version 2.43.0 will result in a runtime exception.**
