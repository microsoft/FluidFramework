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
			"unicorn/no-nested-ternary": "off",
			"@typescript-eslint/no-namespace": "off",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			"import-x/no-nodejs-modules": "off",
			"unicorn/prefer-module": "off",
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},
];

export default config;
