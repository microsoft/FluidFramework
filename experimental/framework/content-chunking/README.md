# @fluid-experimental/content-chunking

Package providing fixed size and [content defined](https://en.wikipedia.org/wiki/Rolling_hash#Content-based_slicing_using_a_rolling_hash) chunking for byte arrays.

## Usage

```ts
const avgChunkSize = 64 * 1024; // bytes
// const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.FixedSize };
const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.ContentDefined };
const contentChunker: IContentChunker = chunkingFactory.createChunkingMethod(chunkingConfig);
const data: Uint8Array  = ...
const chunks: Uint8Array[] = contentChunker.computeChunks(data);
```

## Build

Incremental build. Execute following commands in the _FluidFramework_ root folder:

```
npm install
alias fb='clear && node "$(git rev-parse --show-toplevel)/node_modules/.bin/fluid-build"'
fb --install --symlink
fb @fluid-experimental/content-chunking
```

## Test

Go to _content-chunking_ package folder:

```
cd experimental/framework/content-chunking
```

and execute the tests:

```
npm run test
```
