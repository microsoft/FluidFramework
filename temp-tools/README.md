# Do Not Use

Temporarily committing some nonrobust tools to help with Node16 conversion.

NOTE: When removing, remember to remove the policy-check exclusion '"temp-tools/.*"' from 'fluidBuild.config.js'.

# Debugging
```
{
	"name": "tool",
	"program": "${workspaceFolder}/../tool/index.js",
	"cwd": "${workspaceFolder}/packages/tools/devtools/devtools-view",
	"request": "launch",
	"skipFiles": [
		"<node_internals>/**"
	],
	"type": "node",
	"outFiles": [
		"${workspaceFolder}/../tool/**/*.(m|c|)js",
		"!**/node_modules/**"
	]
},
```

# Running on all packages

```
flub exec "node /workspaces/tools/update-tsconfig" -g client
```