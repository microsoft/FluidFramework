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
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"unicorn/text-encoding-identifier-case": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					"fixStyle": "inline-type-imports",
				},
			],
			"@typescript-eslint/no-import-type-side-effects": "error",
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: ["**/*.{ts,tsx}"],
		ignores: ["**/src/test/**", "**/tests/**", "**/*.spec.ts", "**/*.test.ts"],
		rules: {
			"@typescript-eslint/consistent-type-exports": [
				"error",
				{
					"fixMixedExportsWithInlineTypeSpecifier": true,
				},
			],
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"unicorn/no-null": "off",
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
