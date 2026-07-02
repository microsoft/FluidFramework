---
"@fluidframework/id-compressor": minor
"__section": feature
---
Add originatorless normalization for op-space IDs in id-compressor

`IIdCompressor` now includes `tryNormalizeToSessionSpaceWithoutSession(id)`.
This API supports recovery scenarios where an [op-space identifier](https://fluidframework.com/docs/api/id-compressor/opspacecompressedid-typealias) must be decoded
without the originating session id.

For finalized IDs, the method returns the correct session-space form.
For non-final IDs, it returns `undefined` to indicate that originator context is
required and callers should use `normalizeToSessionSpace(id, originSessionId)` when
that context is available.

```typescript
const maybeSessionId = idCompressor.tryNormalizeToSessionSpaceWithoutSession(opId);
if (maybeSessionId === undefined) {
	const sessionId = idCompressor.normalizeToSessionSpace(opId, originatorId);
	// use sessionId
} else {
	// use maybeSessionId
}
```

`IIdCompressor` is now marked `@sealed`.
Fluid already assumed any `IIdCompressor` was its own implementation and casted them internally.
Any custom implementations will no longer build due to the above change,
but would not have worked at runtime anyway.
The updated tagging now correctly documents this requirement.
