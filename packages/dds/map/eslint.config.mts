/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 */
import type { Linter } from "eslint";
import { strict } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...strict,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"unicorn/numeric-separators-style": "off",
			"@fluid-internal/fluid/no-unchecked-record-access": "warn",
		},
	},
	{
		files: ["src/test/**"],
		rules: {
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
