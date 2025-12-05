/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mjs";

const config = [
	...minimalDeprecated,
	{
		rules: {
			"@typescript-eslint/no-use-before-define": "off",
			"@typescript-eslint/prefer-nullish-coalescing": "off",
			"@typescript-eslint/strict-boolean-expressions": "off",
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/{beta,alpha,legacy,legacy/alpha}",
						"fluid-framework/{beta,alpha,legacy,legacy/alpha}",
						"@fluid-experimental/**",
						"@fluidframework/*/test-utils",
						"@fluid-example/*/{beta,alpha}",
						"*/index.js",
						"*/*.js",
					],
				},
			],
			"max-len": "off",
			"no-bitwise": "off",
			"no-case-declarations": "off",
			"@typescript-eslint/unbound-method": "off",
		},
	},
	{
		files: ["*.spec.ts", "src/test/**"],
		rules: {
			"import-x/no-internal-modules": [
				"error",
				{
					"allow": [
						"@fluidframework/*/{beta,alpha,legacy,legacy/alpha}",
						"fluid-framework/{beta,alpha,legacy,legacy/alpha}",
						"@fluid-experimental/**",
						"@fluidframework/*/test-utils",
						"@fluid-example/*/{beta,alpha}",
						"*/index.js",
						"@fluidframework/test-utils/internal",
						"*/*.js",
					],
				},
			],
		},
	},
];

export default config;
