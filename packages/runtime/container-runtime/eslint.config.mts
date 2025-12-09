/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"@typescript-eslint/explicit-function-return-type": "off",
			"unicorn/consistent-function-scoping": "off",
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:assert", "node:crypto"],
				},
			],
		},
	},
];

export default config;
