# Token Function prototype

This directory contains an unfinished Azure Functions token-minting prototype. It was not part of the validated Azure client path and must not be treated as production authentication.

The validated reference deployment used `InsecureTokenProvider`, which is suitable only for development because the client has access to the tenant signing key.

## Production requirements

A production token service must:

- Authenticate the caller with a trusted identity provider.
- Authorize access to the requested tenant and document on the server.
- Construct user identity from trusted claims rather than caller-supplied query values.
- Keep tenant signing keys in a server-side secret store.
- Issue short-lived, least-privilege tokens.
- Support key rotation, audit logging, rate limiting, abuse protection, and revocation policy.
- Enforce HTTPS and an explicit CORS policy.
- Include dependency locking, automated tests, deployment automation, and operational ownership.

The current function accepts caller-provided tenant, document, and user fields and defaults to broad document scopes. Those shortcuts are reference code only. Do not deploy this directory as an authentication boundary without completing and reviewing the requirements above.