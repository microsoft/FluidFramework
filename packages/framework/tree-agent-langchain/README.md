# @fluidframework/tree-agent-langchain

Utilities for connecting LangChain chat models to the Fluid Framework `@fluidframework/tree-agent` package.

## Installation

```bash
npm install @fluidframework/tree-agent-langchain
```

## Usage

```typescript
import { createLangchainChatModel } from "@fluidframework/tree-agent-langchain/alpha";
import { createTreeAgent } from "@fluidframework/tree-agent/alpha";
import { ChatOpenAI } from "@langchain/openai";

const chatModel = new ChatOpenAI({ model: "gpt-4.1" });
const sharedTreeChatModel = createLangchainChatModel(chatModel);
const agent = createTreeAgent(sharedTreeChatModel, tree);
```

The returned `SharedTreeChatModel` can be used with `createTreeAgent` or `executeSemanticEditing`
from `@fluidframework/tree-agent`.

## Licensing

This project is licensed under the [MIT License](./LICENSE).
