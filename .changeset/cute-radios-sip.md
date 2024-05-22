---
"@fluidframework/azure-client": minor
"@fluidframework/fluid-static": minor
"@fluidframework/tinylicious-client": minor
---

compatibilityMode parameter added to createContainer and getContainer on AzureClient and TinyliciousClient

To support migration from 1.x to 2.0, a compatibility mode parameter has been added to these methods on AzureClient and TinyliciousClient. When set to "1", this allows interop between the 2.0 clients and 1.x clients. When set to "2", interop with 1.x clients is disallowed but new 2.0 features may be used.
