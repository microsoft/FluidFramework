/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { strict } from "../../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...strict,
	{
		rules: {
			"unicorn/numeric-separators-style": "off",
		},
	},
	{
		files: ["*.spec.ts", "*.test.ts", "src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:assert", "node:process"],
				},
			],
			"unicorn/consistent-function-scoping": "off",
		},
	},
];

export default config;
