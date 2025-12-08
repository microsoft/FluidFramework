/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { recommended } from "../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/{beta,alpha,legacy,legacy/alpha}",
						"fluid-framework/{beta,alpha,legacy,legacy/alpha}",
						"@fluid-experimental/**",
						"@fluidframework/*/test-utils",
						"@fluid-example/*/{beta,alpha}",
						"*/index.js",
					],
				},
			],
			"import-x/no-nodejs-modules": [
				"error",
				{
					"allow": ["node:http"],
				},
			],
			"depend/ban-dependencies": [
				"error",
				{
					"allowed": ["lodash.isequal"],
				},
			],
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
			"react/no-deprecated": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**", "tests/**"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/{beta,alpha,legacy,legacy/alpha}",
						"fluid-framework/{beta,alpha,legacy,legacy/alpha}",
						"@fluid-experimental/**",
						"@fluidframework/*/test-utils",
						"@fluid-example/*/{beta,alpha}",
						"*/index.js",
						"@fluidframework/test-utils/internal",
						"*/*.js",
					],
				},
			],
		},
	},
	{
		files: ["tests/**"],
		rules: {
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					"devDependencies": true,
				},
			],
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/{beta,alpha,legacy,legacy/alpha}",
						"fluid-framework/{beta,alpha,legacy,legacy/alpha}",
						"@fluid-experimental/**",
						"@fluidframework/*/test-utils",
						"@fluid-example/*/{beta,alpha}",
						"*/index.js",
						"@fluidframework/test-utils/internal",
						"*/*.js",
						"**/src/*/*.js",
					],
				},
			],
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
