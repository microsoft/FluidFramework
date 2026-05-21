---
"@fluidframework/container-loader": minor
"__section": fix
---
`tryParseCompatibleResolvedUrl` no longer throws on malformed input

`tryParseCompatibleResolvedUrl` previously let a `TypeError` from `new URL(...)` escape when the input was not a well-formed absolute URL (for example a relative path, an empty string, or input containing invalid characters). The `try`-prefixed name implies a non-throwing contract on bad input, and callers all gate on the documented `=== undefined` return value to surface their own error messages, so the throw was bypassing those caller-supplied diagnostics for the broadest class of bad URLs.

The function now wraps the `new URL(...)` call in a try/catch and returns `undefined` for any input that fails to parse as an absolute URL. Callers that already check for `undefined` need no changes; callers that were catching `TypeError` from this function should switch to the `=== undefined` check.
