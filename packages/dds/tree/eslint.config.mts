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
			"@typescript-eslint/no-namespace": "off",
			"@typescript-eslint/no-empty-interface": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{
					"argsIgnorePattern": "^",
					"varsIgnorePattern": "^_",
					"caughtErrorsIgnorePattern": "^_",
				},
			],
			"@typescript-eslint/explicit-member-accessibility": "error",
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{
					"fixStyle": "inline-type-imports",
				},
			],
			"@typescript-eslint/no-import-type-side-effects": "error",
			"@typescript-eslint/explicit-module-boundary-types": "off",
			"@typescript-eslint/no-unsafe-argument": "off",
			"@typescript-eslint/no-unsafe-assignment": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
			"import-x/order": "off",
			"jsdoc/multiline-blocks": "off",
			"jsdoc/require-description": "warn",
			"unicorn/consistent-function-scoping": "off",
			"unicorn/no-array-callback-reference": "off",
			"unicorn/no-array-for-each": "off",
			"unicorn/no-array-method-this-argument": "off",
			"unicorn/no-array-reduce": "off",
			"unicorn/no-await-expression-member": "off",
			"unicorn/no-lonely-if": "off",
			"unicorn/no-negated-condition": "off",
			"unicorn/no-new-array": "off",
			"unicorn/no-null": "off",
			"unicorn/no-object-as-default-parameter": "off",
			"unicorn/no-useless-fallback-in-spread": "off",
			"unicorn/no-zero-fractions": "off",
			"unicorn/prefer-export-from": "off",
			"unicorn/prefer-spread": "off",
			"unicorn/text-encoding-identifier-case": "off",
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
		files: ["src/test/**/*"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./src/test/tsconfig.json"],
			},
		},
		rules: {
			"@typescript-eslint/no-unused-vars": ["off"],
			"@typescript-eslint/explicit-function-return-type": "off",
		},
	},
];

export default config;
