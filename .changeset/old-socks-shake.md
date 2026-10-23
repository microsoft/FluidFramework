---
"@fluidframework/runtime-definitions": minor
"@fluidframework/datastore": minor
"@fluidframework/test-runtime-utils": minor
"__section": legacy
---
Add oldestSupportedClient across runtime layers

Runtime and data store contexts now expose `oldestSupportedClient` beside `minVersionForCollab`.
The runtime uses `oldestSupportedClient` when both properties are present.
Older contexts that expose only `minVersionForCollab` remain supported.

Use `context.oldestSupportedClient ?? context.minVersionForCollab` during the migration.
The on-disk schema and telemetry property names do not change.
See [the migration issue](https://github.com/microsoft/FluidFramework/issues/27851) for more details.
