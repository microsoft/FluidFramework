/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from "../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...recommended,
	{
		rules: {
		  "@typescript-eslint/ban-ts-comment": "off",
		  "@typescript-eslint/explicit-function-return-type": "off",
		  "@typescript-eslint/no-non-null-assertion": "off",
		  "@typescript-eslint/no-unsafe-argument": "off",
		  "@typescript-eslint/no-unsafe-assignment": "off",
		  "@typescript-eslint/no-unsafe-call": "off",
		  "@typescript-eslint/no-unsafe-member-access": "off",
		  "@typescript-eslint/no-unsafe-return": "off",
		  "@typescript-eslint/restrict-plus-operands": "off",
		  "@typescript-eslint/strict-boolean-expressions": "off",
		  "import/no-nodejs-modules": "off",
		  "promise/param-names": "off"
		},
	},
	{
		files: ["src/test/**", "*.spec.ts", "*.test.ts"],
		languageOptions: {
			parserOptions: {
				projectService: false,
				project: ["./tsconfig.lint.json"],
			},
		},
	},
];

export default config;
