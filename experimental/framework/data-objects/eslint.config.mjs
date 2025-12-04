/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from '../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...minimalDeprecated,
	{
		rules: {
		  "@typescript-eslint/strict-boolean-expressions": "off"
		},
	},
	{
		files: ["*.spec.ts","src/test/**"],
		rules: {
		  "import-x/no-nodejs-modules": [
		    "error",
		    {
		      "allow": [
		        "assert"
		      ]
		    }
		  ]
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
