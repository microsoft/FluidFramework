---
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"@fluidframework/driver-definitions": minor
"__section": feature
---
Let applications handle ODSP claims challenges

Set `HostStoragePolicy.propagateAuthChallenges` to `true` to receive ODSP authorization errors whose `www-authenticate` response header contains a claims challenge without a token-refresh retry.
Only challenges with `error="insufficient_claims"` and nonempty decoded claims trigger this behavior.
The error's `wwwAuthenticate` property contains the complete header value for the application to handle.
Treat this value as sensitive authentication data and do not log it.
When the policy is false or omitted, the driver continues to pass decoded claims and tenant information to the token provider and retry.
Other authentication responses, including headers without a claims challenge, retain their existing handling.

```typescript
const factory = new OdspDocumentServiceFactory(
	getStorageToken,
	getWebsocketToken,
	persistedCache,
	{ propagateAuthChallenges: true },
);
```

The share-link resolver accepts the same option in `ShareLinkFetcherProps`.
The `prefetchLatestSnapshot` helper accepts an optional final `propagateAuthChallenges` argument, which defaults to the supplied factory's policy.
When enabled, prefetch rejects with a claims challenge error instead of returning `false`.
