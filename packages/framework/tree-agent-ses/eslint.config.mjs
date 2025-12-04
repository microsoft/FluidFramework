/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { strict } from '../../../common/build/eslint-config-fluid/flat.mjs';

const config = [
	...strict,
	{
		rules: {
		  "import-x/no-internal-modules": [
		    "error",
		    {
		      "allow": [
		        "@fluidframework/*/alpha",
		        "@fluidframework/*/beta",
		        "@fluidframework/*/legacy",
		        "@fluidframework/*/internal"
		      ]
		    }
		  ]
		},
	},
	{
		files: ["src/test/**/*"],
		rules: {
		  "import-x/no-internal-modules": [
		    "error",
		    {
		      "allow": [
		        "*/index.js",
		        "@fluidframework/*/alpha",
		        "@fluidframework/*/beta",
		        "@fluidframework/*/legacy",
		        "@fluidframework/*/internal"
		      ]
		    }
		  ],
		  "import-x/no-unresolved": "off",
		  "@typescript-eslint/no-unsafe-assignment": "off",
		  "@typescript-eslint/no-unsafe-call": "off",
		  "@typescript-eslint/no-unsafe-member-access": "off",
		  "@typescript-eslint/no-unsafe-return": "off",
		  "@typescript-eslint/no-unsafe-argument": "off",
		  "@typescript-eslint/strict-boolean-expressions": "off"
		},
	},
	{
		files: ["src/test/**", "*.spec.ts", "*.test.ts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.json"],
			},
		},
	},
];

export default config;
