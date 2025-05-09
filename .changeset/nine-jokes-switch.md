---
"@fluidframework/tree": minor
"__section": fix
---
Fix issue where local changes were not sent correctly

Fix a bug where local changes were not correctly sent to peers.
This could lead to a permanent loss of consistency and document corruption.
See [PR24561](https://github.com/microsoft/FluidFramework/pull/24561) for details.
