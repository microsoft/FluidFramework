---
"@fluidframework/driver-definitions": minor
"@fluidframework/odsp-driver": minor
"@fluidframework/odsp-driver-definitions": minor
"__section": legacy
---
Claims challenges from OneDrive and SharePoint can be returned to the host instead of being retried

A claims challenge is a 401 or 403 response with a `WWW-Authenticate` header that asks for a token with more claims.
For more information, see [Claims challenges](https://learn.microsoft.com/entra/identity-platform/claims-challenge).
By default, the driver gets a new token one time and retries the request.
It gives the decoded claims to the host's token fetcher in `TokenFetchOptions.claims`.

Some hosts can't satisfy the challenge themselves.
For example, a service that makes requests for another client must send the challenge to that client.
These hosts can now set the new `propagateClaimsChallenges` property of [`HostStoragePolicy`](https://fluidframework.com/docs/api/odsp-driver-definitions/hoststoragepolicy-interface) to `true`.
The driver then doesn't retry the request, and the operation fails with the original authorization error.
The error has the decoded `claims`, and the raw header value in the new `wwwAuthenticate` property of [`IAuthorizationError`](https://fluidframework.com/docs/api/driver-definitions/iauthorizationerror-interface).

```typescript
import { DriverErrorTypes } from "@fluidframework/driver-definitions/legacy";
import { OdspDocumentServiceFactory } from "@fluidframework/odsp-driver/legacy";

const documentServiceFactory = new OdspDocumentServiceFactory(
	getStorageToken,
	getWebsocketToken,
	persistedCache,
	{ propagateClaimsChallenges: true },
);

// ...

if (error.errorType === DriverErrorTypes.authorizationError && error.claims) {
	// Send error.wwwAuthenticate to the client, which can then get a token with the required claims.
}
```

To identify a claims challenge, check for a non-empty `claims` value, as in the example.
Don't check for `wwwAuthenticate`, because the driver sets it on every authorization error from a response that has the header, even when this policy is `false`.

When this policy is `true`, the driver doesn't give the claims to the token fetcher.
So when you load the document again after the challenge is satisfied, make sure that the token fetcher returns the new token, even when `TokenFetchOptions.refresh` is `false`.

As for other authorization errors, the driver clears its cached snapshot of the document when a snapshot request fails with the challenge.
But a load can still succeed, because the driver can use a cached snapshot without waiting for the service.
A later request, such as connecting to the delta stream or fetching ops, then gets the challenge, and the container closes with the error.
So check for a claims challenge in the error of the container's `closed` event as well as in load errors.

The policy also applies to `prefetchLatestSnapshot` when the factory is passed to it.
It doesn't apply to `OdspDriverUrlResolverForShareLink`.

For a document opened from a sharing link, the driver no longer redeems the link in a separate request when the snapshot request fails with a claims challenge.
This applies whether or not the policy is set.
Redeeming the link can't satisfy the challenge, and an error from the redeem request could replace the challenge.
