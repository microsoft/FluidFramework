/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mjs";

const config = [
	...recommended,
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {},
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
