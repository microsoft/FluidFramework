/* eslint-disable */
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 * To regenerate: pnpm tsx scripts/generate-flat-eslint-configs.ts
 */
import type { Linter } from "eslint";
import { recommended } from "../../../common/build/eslint-config-fluid/flat.mts";

const config: Linter.Config[] = [
	...recommended,
	{
		rules: {
		  "import-x/no-internal-modules": [
		    "error",
		    {
		      "allow": [
		        "@fluidframework/*/beta",
		        "@fluidframework/*/alpha",
		        "next/**",
		        "@/actions/**",
		        "@/types/**",
		        "@/infra/**",
		        "@/components/**",
		        "@/app/**",
		        "@fluidframework/ai-collab/alpha"
		      ]
		    }
		  ],
		  "import-x/no-extraneous-dependencies": [
		    "error",
		    {
		      "devDependencies": true
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
	{
		files: ["src/actions/task.ts"],
		rules: {
		  "import-x/no-nodejs-modules": [
		    "error",
		    {
		      "allow": [
		        "node:fs",
		        "node:path",
		        "node:url"
		      ]
		    }
		  ]
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
