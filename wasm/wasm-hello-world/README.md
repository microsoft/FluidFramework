# WASM in Fluid 

Proof of concept of WASM running in Fluid and set up in the monorepo

## Try it out
To get this working locally:
 1. Open the workspace file `.vscode/wasm.code-workspace`
    - There should be an "Open Workspace" button in the bottom right of the open file
 1. `npm i` from `wasm-hello-world`
 1. `npm run build` from `wasm-hello-world`
 1. If you want to test a change locally, you can override the package in the root package.json of FluidFramework
    - The entry should look something like this:
    ```
    	"pnpm": {
		"overrides": {
			"@fluid-experimental/wasm-hello-world": "/workspaces/FluidFramework/wasm/wasm-hello-world/target-web"
		},
    ```
  
## TODO
1. Build steps/Debug steps for native
2. Recommended/Required extensions
3. Docs stuff