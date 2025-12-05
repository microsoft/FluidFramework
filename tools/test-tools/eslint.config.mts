/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import type { Linter } from "eslint";
import { recommended } from "../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
		  "@typescript-eslint/ban-ts-comment": "off",
		  "@typescript-eslint/no-non-null-assertion": "off",
		  "import/no-nodejs-modules": "off",
		  "unicorn/no-process-exit": "off",
		  "unicorn/prefer-node-protocol": "off"
		},
	},
];

export default config;
