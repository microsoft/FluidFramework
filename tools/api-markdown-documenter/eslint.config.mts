/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { strict } from "../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"@fluid-internal/fluid/no-unchecked-record-access": "off",
			"@typescript-eslint/class-literal-property-style": "off",
			"@typescript-eslint/no-unsafe-enum-comparison": "off",
			"unicorn/prevent-abbreviations": [
				"error",
				{
					"allowList": {
						"i": true,
					},
				},
			],
			"unicorn/prefer-module": "off",
			"unicorn/prefer-negative-index": "off",
			"import/no-nodejs-modules": "off",
		},
	},
	{
		files: ["src/**/test/**"],
		rules: {
			"import/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": true,
				},
			],
			"@typescript-eslint/no-unused-expressions": "off",
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
