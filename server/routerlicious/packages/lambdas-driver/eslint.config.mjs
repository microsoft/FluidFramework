/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from '../../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...minimalDeprecated,
	{
		rules: {
		  "import-x/no-nodejs-modules": "off",
		  "promise/catch-or-return": [
		    "error",
		    {
		      "allowFinally": true
		    }
		  ],
		  "@typescript-eslint/prefer-nullish-coalescing": "off",
		  "@typescript-eslint/strict-boolean-expressions": "off",
		  "import-x/no-deprecated": "warn"
		},
	},
];

export default config;
