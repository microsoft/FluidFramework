/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import type { Linter } from "eslint";
import { recommended } from "../../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
		  "@typescript-eslint/no-unsafe-argument": "off",
		  "@fluid-internal/fluid/no-unchecked-record-access": "warn"
		},
	},
	{
		files: ["**/*.jsx", "**/*.tsx"],
		rules: {
		  "react/no-deprecated": "off"
		},
	},
];

export default config;
