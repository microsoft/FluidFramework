# @fluidframework/tree-agent-langchain

Utilities for connecting LangChain chat models to the Fluid Framework `@fluidframework/tree-agent` package.

## Installation

```bash
npm install @fluidframework/tree-agent-langchain
```

## Usage

```typescript
import { createLangchainChatModel } from "@fluidframework/tree-agent-langchain";
import { ChatOpenAI } from "@langchain/openai";

const chatModel = new ChatOpenAI({ model: "gpt-4.1" });
const sharedTreeChatModel = createLangchainChatModel(chatModel);
```

The returned `SharedTreeChatModel` can be provided to `SharedTreeSemanticAgent` from `@fluidframework/tree-agent`.

## Licensing

This project is licensed under the [MIT License](./LICENSE).
