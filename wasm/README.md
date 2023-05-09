# WASM in Fluid

## Prerequisites

For quick setup on windows, run `./init.ps1`

For setup on linux or codespaces, install the following:

1. rust, rustup, and cargo - https://www.rust-lang.org/tools/install
1. wasm-pack - https://rustwasm.github.io/wasm-pack/installer/
1. wasm-opt - `cargo install wasm-opt --version 0.112.0`
1. wasm-snip - `cargo install wasm-snip --version 0.4.0`

## Architecture

The wasm folder is split up into a set of crates (Rust) and a set of TS projects. The crates are subdivided into two categories:

1. Normal, idiomatic rust
2. Glue crates that depend on items from the idiomatic rust category to be packaged together and surface an API designed for JS/WASM interop

By splitting into these categories, normal rust crates can depend on each other without worrying about surfacing an API that is suitable for JS/WASM interop (e.g. an API surface can return numeric types that aren't supported by JS). At the glue crate level, the APIs from the idiomatic crates are aggregated and can be cast to types suitable for JS/WASM interop. This has the advantage of outputting a single WASM binary (reduced overall code size) and shares a single WASM heap at runtime.

## Dev Flow

### Rust Development

Write code as you normally would. Build with cargo and write tests in Rust. Install the recommended extensions in the workspace for autocompletion and debugging.

### Typescript Development

Run the build script in the root package.json to output WASM binaries of declared rust "glue" crates and build any typescript projects in the `typescript` directory. To build just typescript projects (without any rust changes), run `pnpm run build:ts`.

### E2E development

### Adding a new package/crate

## Try it out

To get this working locally:

1.  Open the workspace file `.vscode/wasm.code-workspace`
    -   There should be an "Open Workspace" button in the bottom right of the open file
1.  `npm i` from `wasm-hello-world`
1.  `npm run build` from `wasm-hello-world`
1.  If you want to test a change locally, you can override the package in the root package.json of FluidFramework
    -   The entry should look something like this:
    ```
    	"pnpm": {
    	"overrides": {
    		"@fluid-experimental/wasm-hello-world": "/workspaces/FluidFramework/wasm/wasm-hello-world/target-web"
    	},
    ```

## TODO

1. Docs stuff
2. New package setup instructions
