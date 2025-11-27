/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mjs";

const config = [
	...recommended,
	{
		files: ["**/*.js"],
		rules: {
			"@typescript-eslint/explicit-function-return-type": "off",
			"@typescript-eslint/no-require-imports": "off",
			"unicorn/prefer-module": "off",
		},
	},
];

export default config;
