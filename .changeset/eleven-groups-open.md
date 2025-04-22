---
"@fluidframework/presence": minor
"__section": other
---
StateFactory.latest/latestMap now takes an object as its only argument

The `StateFactory.latest` and `StateFactory.latestMap` functions now take a single object argument. To convert existing
code, pass any initial data in the `local` argument, and broadcast settings in the `settings` argument. For example:

Before:

```ts
	const statesWorkspace = presence.states.getWorkspace("name:workspace", {
		cursor: StateFactory.latest(
			{ x: 0, y: 0 },
			{ allowableUpdateLatencyMs: 100 }),
	});
```

After:

```ts
	const statesWorkspace = presence.states.getWorkspace("name:workspace", {
		cursor: StateFactory.latest({
			local: { x: 0, y: 0 },
			settings: { allowableUpdateLatencyMs: 100 },
		}),
	});
```
