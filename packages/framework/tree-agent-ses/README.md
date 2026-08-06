# @fluidframework/tree-agent-ses

Secure edit execution helpers for the `@fluidframework/tree-agent` package backed by the SES runtime.

## Installation

```bash
npm install @fluidframework/tree-agent-ses
```

## Usage

```typescript
import { createSesEditExecutor } from "@fluidframework/tree-agent-ses/alpha";
import { executeSemanticEditing } from "@fluidframework/tree-agent/alpha";

const editor = createSesEditExecutor();
await executeSemanticEditing(model, tree, prompt, { editor });
```

The returned callback can be provided as the `editor` option to `createTreeAgent` or
`executeSemanticEditing` from `@fluidframework/tree-agent`.

## Licensing

This project is licensed under the [MIT License](./LICENSE).
