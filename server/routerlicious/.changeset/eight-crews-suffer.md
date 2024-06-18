---
"@fluidframework/server-lambdas": "minor"
---

server-lambdas: Fix: send correct connection scopes for client

When a client joins in "write" mode with only "read" scopes in their token, the connection message from server will reflect a "read" client mode.

You can find more details in [pull request #20312](https://github.com/microsoft/FluidFramework/pull/20312).
