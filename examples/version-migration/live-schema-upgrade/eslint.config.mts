/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import type { Linter } from "eslint";
import { minimalDeprecated } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...minimalDeprecated,
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
		        "*/index.js"
		      ]
		    }
		  ]
		},
	},
	{
		files: ["*.spec.ts","src/test/**","tests/**"],
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
		        "*/*.js"
		      ]
		    }
		  ]
		},
	},
];

export default config;
