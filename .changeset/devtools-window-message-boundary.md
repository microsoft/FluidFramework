---
"@fluidframework/devtools-core": minor
"__section": fix
---
Devtools ignores messages from other windows

Devtools now accepts window messages only from the application's own window.
This prevents other windows from directly issuing devtools commands through window messaging.
