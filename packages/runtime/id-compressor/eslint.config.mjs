/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from '../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...recommended,
	{
		rules: {
		  "@typescript-eslint/strict-boolean-expressions": "off"
		},
	},
	{
		files: ["*.spec.ts","src/test/**/*.ts"],
		rules: {
		  "import-x/no-nodejs-modules": [
		    "error",
		    {
		      "allow": [
		        "node:assert",
		        "node:crypto",
		        "node:fs",
		        "node:path"
		      ]
		    }
		  ]
		},
	},
];

export default config;
