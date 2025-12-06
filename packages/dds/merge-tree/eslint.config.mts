/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"keyword-spacing": "off",
			"no-case-declarations": "off",
			"prefer-arrow/prefer-arrow-functions": "off",
			"unicorn/no-useless-spread": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"unicorn/consistent-function-scoping": "off",
		},
	},
];

export default config;
