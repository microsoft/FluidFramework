/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
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
