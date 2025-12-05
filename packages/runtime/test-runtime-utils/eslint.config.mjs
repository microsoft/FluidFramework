/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/strict-boolean-expressions": "off",
		},
	},
	{
		files: ["src/assertionShortCodesMap.ts"],
		rules: {
			"@typescript-eslint/comma-dangle": "off",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
		},
	},
];

export default config;
