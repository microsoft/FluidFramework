# WASM in Fluid

## Prerequisites

For quick setup on windows, run `./init.ps1`

For setup on linux or codespaces, install the following:

1. [rust, rustup, and cargo](https://www.rust-lang.org/tools/install)
1. wasm-pack - `npm i wasm-pack@0.10.3 -g`
1. wasm-opt - `npm i wasm-opt@1.4.0 -g`
1. wasm-snip - `cargo install wasm-snip --version 0.4.0`

## Architecture

The wasm folder is split up into a set of crates (Rust) and a set of TS projects.
The crates are subdivided into two categories:

1. Normal, idiomatic rust
2. Glue crates that depend on items from the idiomatic rust category to be packaged together and surface an API designed for JS/WASM interop

By splitting into these categories, normal rust crates can depend on each other without worrying about surfacing an API that is suitable for JS/WASM interop (e.g. an API surface can return numeric types that aren't supported by JS).
At the glue crate level, the APIs from the idiomatic crates are aggregated and can be cast to types suitable for JS/WASM interop.
This has the advantage of outputting a single WASM binary (reduced overall code size) and shares a single WASM heap at runtime.
This pattern is optimized for overall code size (e.g. client-wasm will be loaded by the runtime).
If code size isn't a concern, an alternate pattern could be used.

## Dev Flow

### Rust Development

Write code as you normally would.
Build with cargo and write tests in Rust.
Install the recommended extensions in the workspace for autocompletion and debugging.

#### Tooling

There are several tools being used to facilitate Rust WASM development:

1. wasm-pack - packages the crate as WASM and TS
2. wasm-opt - optimizes output WASM
3. wasm-snip - **removes panic and formatting code from the output WASM to reduce binary size**
4. twiggy - tool for inspecting WASM binaries

**Note:** Due to wasm-snip, anything that depends on on text formatting (`std::fmt`) in rust should not be used as it will be snipped out and will result in a runtime error.

### TypeScript Development

Run the build script in the root package.json to output WASM binaries of declared rust "glue" crates and build any typescript projects in the `typescript` directory.
To build just typescript projects (without any rust changes), run `pnpm run build:ts`.

### E2E development

TODO: Write this section after demoing

### Adding a new package/crate

#### Rust

Rust crates must be added under the `wasm` root folder (`cargo new --lib {name}`).
After creating a crate, it must be added to the root `Cargo.toml` as a member of the workspace.
If the crate is surfacing a WASM API (being directly consumed by a project in the `typescript` directory), it must be added to the `fluid-wasm-output-bundles` list under the root `Cargo.toml`'s metadata.

#### TypeScript

New typescript projects must be added to the `typescript` directory and can only consume projects listed in the root `Cargo.toml`'s `fluid-wasm-output-bundles` metadata list.
The dependency should be added as a workspace dependency using `workspace:~` (e.g. `"@fluidframework/client-wasm": "workspace:~"`).
