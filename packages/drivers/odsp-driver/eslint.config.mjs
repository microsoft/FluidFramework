/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mjs";

const config = [
	...recommended,
	{
		rules: {
			"@typescript-eslint/no-non-null-assertion": "off",
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"unicorn/text-encoding-identifier-case": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/consistent-type-exports": [
				"error",
				{
					"fixMixedExportsWithInlineTypeSpecifier": true,
				},
			],
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
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"unicorn/no-null": "off",
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
