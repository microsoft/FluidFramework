/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import type { Linter } from "eslint";
import { strict } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
		  "unicorn/no-nested-ternary": "off",
		  "@typescript-eslint/no-namespace": "off"
		},
	},
	{
		files: ["*.spec.ts","*.test.ts","src/test/**"],
		rules: {
		  "import-x/no-nodejs-modules": "off",
		  "unicorn/prefer-module": "off"
		},
	},
	{
		files: ["src/test/**", "*.spec.ts", "*.test.ts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.json"],
			},
		},
	},
];

export default config;
