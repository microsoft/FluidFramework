---
"@fluidframework/presence": minor
"__section": other
---
StateFactory.latest and StateFactory.latestMap now accept a validator parameter

The StateFactory.latest and StateFactory.latestMap APIs now accept a `validator` argument. The `validator` is a function
that will be called at runtime to verify that the data is valid. This is especially useful when changing the schema of
presence data.

See [the presence documentation](https://fluidframework.com/docs/build/presence) for more details.
