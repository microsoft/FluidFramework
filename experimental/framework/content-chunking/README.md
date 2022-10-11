# @fluid-experimental/content-chunking

Package providing fixed size and [content defined](https://en.wikipedia.org/wiki/Rolling_hash#Content-based_slicing_using_a_rolling_hash) chunking for byte arrays.

For efficiency reasons the content based slicing is done in [web assembly](https://rustwasm.github.io/docs/book/what-is-webassembly.html). More details on the algorithm election, implementation choices, performance and stability benchmarks are captured in the [implementation story](https://github.com/microsoft/FluidFramework/issues/11572).

## Usage

```ts
const avgChunkSize = 64 * 1024; // bytes
// const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.FixedSize };
const chunkingConfig: IChunkingConfig = { avgChunkSize, chunkingStrategy: ChunkingStrategyEnum.ContentDefined };
const contentChunker: IContentChunker = chunkingFactory.createChunkingMethod(chunkingConfig);
const data: Uint8Array  = ...
const chunks: Uint8Array[] = contentChunker.computeChunks(data);
```

## Webpack

When using this package, the `webpack.config` requires _web assembly_ support

```js
module.exports = {
    ...
    experiments: {
        asyncWebAssembly: true,
        syncWebAssembly: true
    },
};
```

## Build

Execute following commands in the _FluidFramework_ root folder to build incrementally:

```sh
npm install
alias fb='clear && node "$(git rev-parse --show-toplevel)/node_modules/.bin/fluid-build"'
fb --install --symlink
fb @fluid-experimental/content-chunking
```

## Test

Go to _content-chunking_ package folder:

```sh
cd experimental/framework/content-chunking
```

and execute the tests:

```sh
npm run test
```
