/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts --typescript
 *
 * Shared ESLint configuration.
 * Extend this in child package eslint.config.mts files to avoid duplicating common rules.
 * Named exports (e.g., importInternalModulesAllowed) can be imported and extended by consumers.
 */
import type { Linter } from "eslint";

export const importInternalModulesAllowed: string[] = [
	"@fluidframework/*/{beta,alpha,legacy,legacy/alpha}",
	"fluid-framework/{beta,alpha,legacy,legacy/alpha}",
	"@fluid-experimental/**",
	"@fluidframework/*/test-utils",
	"@fluid-example/*/{beta,alpha}",
	"*/index.js",
];

export const importInternalModulesAllowedForTest: string[] = [
	"@fluidframework/*/{beta,alpha,legacy,legacy/alpha}",
	"fluid-framework/{beta,alpha,legacy,legacy/alpha}",
	"@fluid-experimental/**",
	"@fluidframework/*/test-utils",
	"@fluid-example/*/{beta,alpha}",
	"*/index.js",
	"@fluidframework/test-utils/internal",
	"*/*.js",
];

const config: Linter.Config[] = [
	{
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
					],
				},
			],
		},
	},
	{
		files: ["*.spec.ts", "src/test/**", "tests/**"],
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
