/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { recommended } from "../../common/build/eslint-config-fluid/flat.mts";
import sharedConfig, { importInternalModulesAllowedForTest } from "../eslint.config.data.mts";

const config: Linter.Config[] = [
	...recommended,
	...sharedConfig,
	{
		rules: {
			"import-x/no-nodejs-modules": [
				"error",
				{
					allow: ["node:http"],
				},
			],
			"depend/ban-dependencies": [
				"error",
				{
					allowed: ["lodash.isequal"],
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
		files: ["tests/**"],
		rules: {
			"import-x/no-extraneous-dependencies": [
				"error",
				{
					devDependencies: true,
				},
			],
			// Since the "tests" directory is adjacent to "src", and this package (intentionally) does not expose
			// a single exports roll-up, reaching into "src" is required.
			"import-x/no-internal-modules": [
				"error",
				{
					allow: [...importInternalModulesAllowedForTest, "**/src/*/*.js"],
				},
			],
			// Fine for tests to use node.js modules.
			// Tests will ensure our webpack configuration is correctly set up to support any that we use.
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
