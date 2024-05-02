---
"@fluidframework/azure-client": minor
"@fluidframework/azure-end-to-end-tests": minor
---

copyContainer API replaced by the viewContainerVersion API

The copyContainer API has been removed in favor of the viewContainerVersion API. viewContainerVersion does not automatically produce a new container, but instead retrieves the existing container version for reading only. To produce a new container with the data, use the normal createContainer API surface and write the data prior to attaching it.
