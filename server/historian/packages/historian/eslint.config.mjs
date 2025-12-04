/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from '../../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...minimalDeprecated,
	{
		rules: {
		  "import/no-nodejs-modules": "off",
		  "@typescript-eslint/prefer-nullish-coalescing": "off",
		  "@typescript-eslint/strict-boolean-expressions": "off"
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
