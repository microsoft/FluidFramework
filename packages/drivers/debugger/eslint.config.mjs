/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from '../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...minimalDeprecated,
	{
		rules: {
		  "@typescript-eslint/no-non-null-assertion": "off",
		  "@typescript-eslint/no-use-before-define": "off",
		  "@typescript-eslint/strict-boolean-expressions": "off",
		  "import-x/no-nodejs-modules": "off",
		  "no-inner-declarations": "off"
		},
	},
];

export default config;
