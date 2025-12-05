/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from "../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...recommended,
	{
		rules: {
		  "@typescript-eslint/no-shadow": "off",
		  "space-before-function-paren": "off",
		  "import/no-nodejs-modules": [
		    "error",
		    {
		      "allow": [
		        "node:v8",
		        "perf_hooks",
		        "node:child_process"
		      ]
		    }
		  ]
		},
	},
	{
		files: ["src/test/**"],
		rules: {
		  "import/no-nodejs-modules": "off"
		},
	},
];

export default config;
