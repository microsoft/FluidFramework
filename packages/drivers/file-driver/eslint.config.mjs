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
		  "@typescript-eslint/strict-boolean-expressions": "off",
		  "import-x/no-nodejs-modules": [
		    "error",
		    {
		      "allow": [
		        "fs"
		      ]
		    }
		  ]
		},
	},
];

export default config;
