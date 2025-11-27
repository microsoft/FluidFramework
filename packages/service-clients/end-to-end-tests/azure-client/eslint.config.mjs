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
	{
		files: ["*.spec.ts", "*.test.ts", "**/test/**"],
		rules: {
			"import-x/no-deprecated": "warn",
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/{beta,alpha,legacy}",
						"fluid-framework/{beta,alpha,legacy}",
						"@fluidframework/*/test-utils",
						"*/index.js",
						"@fluidframework/telemetry-utils/internal",
						"@fluidframework/test-utils/internal",
						"@fluidframework/test-runtime-utils/internal",
					],
				},
			],
		},
	},
];

export default config;
