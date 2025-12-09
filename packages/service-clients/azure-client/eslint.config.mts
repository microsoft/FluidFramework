/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"unicorn/prevent-abbreviations": [
				"error",
				{
					"allowList": {
						"i": true,
					},
					"ignore": ["[pP]rops"],
				},
			],
		},
	},
	{
		files: ["src/test/types/*"],
		rules: {
			"unicorn/prevent-abbreviations": "off",
		},
	},
	{
		files: ["src/test/*.spec.ts"],
		rules: {
			"prefer-arrow-callback": "off",
		},
	},
];

export default config;
