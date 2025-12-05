/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
	{
		rules: {
		  "@typescript-eslint/prefer-nullish-coalescing": "off",
		  "@typescript-eslint/strict-boolean-expressions": "off",
		  "import-x/no-deprecated": "off",
		  "@typescript-eslint/unbound-method": "off"
		},
	},
];

export default config;
