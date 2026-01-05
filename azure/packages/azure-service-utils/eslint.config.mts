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
			"import-x/no-unassigned-import": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"unicorn/prevent-abbreviations": [
				"error",
				{
					"allowList": {
						"i": true,
					},
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
];

export default config;
