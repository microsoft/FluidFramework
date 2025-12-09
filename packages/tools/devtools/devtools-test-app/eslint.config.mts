/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { strict } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"@typescript-eslint/unbound-method": "off",
			"unicorn/consistent-function-scoping": "off",
			"unicorn/no-nested-ternary": "off",
			"import-x/no-extraneous-dependencies": "off",
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react/no-deprecated": "off",
		},
	},
	{
		files: ["src/**/*.spec.ts", "src/**/*.test.ts", "src/**/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"unicorn/prefer-module": "off",
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.json"],
			},
		},
	},
];

export default config;
