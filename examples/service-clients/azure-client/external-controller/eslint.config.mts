/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import type { Linter } from "eslint";
import { recommended } from "../../../../common/build/eslint-config-fluid/flat.mjs";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"import-x/no-extraneous-dependencies": "warn",
			"unicorn/number-literal-case": "off",
			"@typescript-eslint/brace-style": "off",
		},
	},
];

export default config;
