---
"@fluidframework/container-runtime": minor
"@fluidframework/container-loader": minor
"@fluidframework/odsp-driver": minor
"__section": legacy
---
Expose point-in-time version mark APIs through legacy alpha entrypoints

First-party hosts can import the version mark resolver, point-in-time container loader, and ODSP
point-in-time document service factory without depending on package-internal entrypoints.

```ts
import type { IVersionMarkResolver } from "@fluidframework/container-runtime/legacy/alpha";
import { loadContainerToSequenceNumber } from "@fluidframework/container-loader/legacy/alpha";
import { OdspPointInTimeDocumentServiceFactory } from "@fluidframework/odsp-driver/legacy/alpha";
```
