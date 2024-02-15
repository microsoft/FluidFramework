---
"@fluidframework/container-definitions": minor
---

## Overview

-   Deprecated `IDeltaManager.inbound` as it was not very useful to the customer and there are pieces of functionality
    that can break the core runtime if used improperly. For example, summarization and processing batches.
-   Deprecated `IDeltaManager.outbound` as it was not very useful to the customer and there are pieces of functionality
    that can break the core runtime if used improperly. For example, generation of batches and chunking.
