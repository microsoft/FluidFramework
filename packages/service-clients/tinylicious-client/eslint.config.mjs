/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { strict } from "../../../common/build/eslint-config-fluid/flat.mjs";

/** @type {import("eslint").Linter.Config[]} */
const config = [
	...strict,
	{
		files: ["src/test/*.spec.ts"],
		rules: {
			"prefer-arrow-callback": "off",
		},
	},
];

export default config;
