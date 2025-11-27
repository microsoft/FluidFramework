/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from "../../../../common/build/eslint-config-fluid/flat.mjs";

const config = [
	...recommended,
	{
		rules: {
			"prefer-arrow-callback": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/namespace": "off",
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
		},
	},
];

export default config;
