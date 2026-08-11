# Denormalized Formats

Non-breaking differences within a single format that are unintended are considered denormalized from the expected form.
When such issues with a format are detected, we may update client code to tolerate reads of both formats.
In some cases, we may also decide to write the normalized format immediately (i.e. without staged rollout).

In these cases, it's still important to test backward compatibility of the denormalized format.

This file documents instances of such cases and how `SharedTree` handles them.

## 0.0.2

### Empty Traits

A past revision of shared-tree produced summaries containing traits with no contents:

```json
{
	"definition": "A",
	"identifier": "89483af1-a533-5667-8e9c-2d318600cf09",
	"traits": {
		"trait": []
	}
}
```

This was normalized to the following format as part of 0.0.2:

```json
{
	"definition": "A",
	"identifier": "89483af1-a533-5667-8e9c-2d318600cf09",
	"traits": {}
}
```

Clients which encounter the denormalized format will write a normalized format in the `currentView` property of the summary but leave edits in history denormalized.
