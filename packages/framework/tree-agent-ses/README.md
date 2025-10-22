# @fluidframework/tree-agent-ses

Secure edit execution helpers for the `@fluidframework/tree-agent` package backed by the SES runtime.

## Installation

```bash
npm install @fluidframework/tree-agent-ses
```

## Usage

```typescript
import { createSesEditExecutor } from "@fluidframework/tree-agent-ses";

const executeEdit = createSesEditExecutor();
```

The returned callback can be provided as the `executeEdit` option when constructing a `SharedTreeSemanticAgent` from `@fluidframework/tree-agent`.

## Licensing

This project is licensed under the [MIT License](./LICENSE).
