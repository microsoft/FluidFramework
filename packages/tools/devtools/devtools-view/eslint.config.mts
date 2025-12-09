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
			"unicorn/no-useless-undefined": "off",
			"no-restricted-imports": ["error", "@fluentui/react"],
			"import-x/no-unassigned-import": [
				"error",
				{
					"allow": ["@testing-library/jest-dom"],
				},
			],
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react-hooks/rules-of-hooks": "warn",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"unicorn/prefer-module": "off",
			"import-x/no-internal-modules": "off",
		},
	},
	{
		files: ["src/test/screenshot/**"],
		rules: {
			"import-x/no-default-export": "off",
			"import-x/no-nodejs-modules": "off",
			"import-x/no-extraneous-dependencies": "off",
		},
	},
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.esm.json", "./src/test/tsconfig.esm.json"],
			},
		},
	},
];

export default config;
