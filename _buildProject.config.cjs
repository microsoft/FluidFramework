/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This file will be renamed to repoLayout.config.cjs in a future change. Right now it is an example of what the
 * IFluidRepoLayout config would look like for our main FluidFramework repo.
 */

// Enable TypeScript type-checking for this file.
// See https://www.typescriptlang.org/docs/handbook/intro-to-js-ts.html#ts-check
// @ts-check

/**
 * All fluid scopes EXCEPT for @fluid-example
 */
const fluidScopes = [
	"@fluidframework",
	"@fluid-experimental",
	"@fluid-internal",
	"@fluid-private",
	"@fluid-tools",
];

/**
 * The settings in this file configure the repo layout used by build-tools, such as fluid-build and flub.
 *
 * @type {import("@fluid-tools/build-infrastructure").IBuildProjectConfig}
 */
module.exports = {
	version: 1,
	buildProject: {
		workspaces: {
			"client": {
				directory: ".",
				releaseGroups: {
					client: {
						include: [...fluidScopes, "fluid-framework", "@types/jest-environment-puppeteer"],
						rootPackageName: "client-release-group-root",
						defaultInterdependencyRange: "workspace:~",
					},
					examples: {
						include: ["@fluid-example"],
						defaultInterdependencyRange: "workspace:~",
					},
				},
			},
			"build-tools": {
				directory: "./build-tools",
				releaseGroups: {
					"build-tools": {
						include: [...fluidScopes, "@fluid-example"],
						rootPackageName: "build-tools-release-group-root",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=14",
					},
				},
			},
			"server": {
				directory: "./server/routerlicious",
				releaseGroups: {
					"server": {
						include: [...fluidScopes, "@fluid-example", "tinylicious"],
						rootPackageName: "server-release-group-root",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=30",
					},
				},
			},
			"gitrest": {
				directory: "server/gitrest",
				releaseGroups: {
					"gitrest": {
						include: [...fluidScopes, "@fluid-example"],
						rootPackageName: "gitrest-release-group-root",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=26",
					},
				},
			},
			"historian": {
				directory: "server/historian",
				releaseGroups: {
					"historian": {
						include: [...fluidScopes, "@fluid-example"],
						rootPackageName: "historian-release-group-root",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=25",
					},
				},
			},

			// legacy independent packages are all in their own workspaces, and are single-package release groups
			"@fluid-tools/api-markdown-documenter": {
				directory: "tools/api-markdown-documenter",
				releaseGroups: {
					"api-markdown-documenter": {
						include: ["@fluid-tools/api-markdown-documenter"],
						rootPackageName: "@fluid-tools/api-markdown-documenter",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=97",
					},
				},
			},
			"@fluid-tools/benchmark": {
				directory: "tools/benchmark",
				releaseGroups: {
					"benchmark": {
						include: ["@fluid-tools/benchmark"],
						rootPackageName: "@fluid-tools/benchmark",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=62",
					},
				},
			},
			"@fluidframework/build-common": {
				directory: "common/build/build-common",
				releaseGroups: {
					"build-common": {
						include: ["@fluidframework/build-common"],
						rootPackageName: "@fluidframework/build-common",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=3",
					},
				},
			},
			"@fluidframework/common-utils": {
				directory: "common/lib/common-utils",
				releaseGroups: {
					"common-utils": {
						include: ["@fluidframework/common-utils"],
						rootPackageName: "@fluidframework/common-utils",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=10",
					},
				},
			},
			"@fluidframework/eslint-config-fluid": {
				directory: "common/build/eslint-config-fluid",
				releaseGroups: {
					"eslint-config-fluid": {
						include: ["@fluidframework/eslint-config-fluid"],
						rootPackageName: "@fluidframework/eslint-config-fluid",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=7",
					},
				},
			},
			"@fluid-internal/eslint-plugin-fluid": {
				directory: "common/build/eslint-plugin-fluid",
				releaseGroups: {
					"eslint-plugin-fluid": {
						include: ["@fluid-internal/eslint-plugin-fluid"],
						rootPackageName: "@fluid-internal/eslint-plugin-fluid",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=135",
					},
				},
			},
			"@fluid-internal/getkeys": {
				directory: "tools/getkeys",
				releaseGroups: {
					"getkeys": {
						include: ["@fluid-internal/getkeys"],
						rootPackageName: "@fluid-internal/getkeys",
						defaultInterdependencyRange: "workspace:~",
					},
				},
			},
			"@fluidframework/protocol-definitions": {
				directory: "common/lib/protocol-definitions",
				releaseGroups: {
					"protocol-definitions": {
						include: ["@fluidframework/protocol-definitions"],
						rootPackageName: "@fluidframework/protocol-definitions",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=67",
					},
				},
			},
			"@fluidframework/test-tools": {
				directory: "tools/test-tools",
				releaseGroups: {
					"test-tools": {
						include: ["@fluidframework/test-tools"],
						rootPackageName: "@fluidframework/test-tools",
						defaultInterdependencyRange: "workspace:~",
						adoPipelineUrl:
							"https://dev.azure.com/fluidframework/internal/_build?definitionId=13",
					},
				},
			},
		},
	},
};
