# WASM in Fluid 

Proof of concept of WASM running in Fluid and set up in the monorepo

## Try it out
To get this working locally:
 1. Run `npm i` (not pnpm for now) from `./site`
 2. Run `npm run build` from `./site`
 3. Run `pnpm link --dir ../../packages/runtime/container-runtime` from `./pkg_combo`