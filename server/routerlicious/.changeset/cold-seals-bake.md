---
"@fluidframework/server-lambdas": "minor"
---

server-lambdas: Nexus client connections can now disconnect in batches

Added the option to make Nexus client connections disconnect in batches. The new options are within `socketIo`
element of the Nexus config:

-   `gracefulShutdownEnabled` (true or false)
-   `gracefulShutdownDrainTimeMs` (overall time for disconnection)
-   `gracefulShutdownDrainIntervalMs` (how long each batch has to disconnect)

Additionally, the `DrainTimeMs` setting should be set to a value greater than the setting
`shared:runnerServerCloseTimeoutMs` which governs how long Alfred and Nexus have to shutdown.

You can find more details in [pull request #19938](https://github.com/microsoft/FluidFramework/pull/19938).
