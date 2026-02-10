/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromFluidHandlers, policy, type RepopoConfig } from "repopo";
import { policyHandlers } from "./build-tools/packages/build-cli/src/library/repoPolicyCheck/index.js";

/**
 * Handlers that are fully disabled via ".*" exclusion in the original config.
 * These are not loaded at all.
 */
const disabledHandlers = new Set([
	"npm-package-exports-field",
	"npm-package-json-prettier",
	"fluid-build-tasks-eslint",
]);

/**
 * Per-handler exclusions migrated from fluidBuild.config.cjs policy.handlerExclusions.
 *
 * These are regex pattern strings matched case-insensitively against repo-relative file paths,
 * consistent with the original flub check policy behavior.
 */
const handlerExclusions: Record<string, string[]> = {
	"fluid-build-tasks-tsc": [
		// Server packages need to be cleaned up; excluding as a workaround
		"^server/routerlicious/packages/.*/package.json",
	],
	"html-copyright-file-header": [
		// Tests generate HTML "snapshot" artifacts
		"tools/api-markdown-documenter/src/test/snapshots/.*",
	],
	"js-ts-copyright-file-header": [
		// These files all require a node shebang at the top of the file.
		"azure/packages/azure-local-service/src/index.ts",
		"experimental/PropertyDDS/packages/property-query/test/get_config.js",
		"server/routerlicious/packages/tinylicious/src/index.ts",

		// minified DOMPurify is not a source file, so it doesn't need a header.
		"docs/static/dompurify/purify.min.js",

		// printed ESLint configs do not need headers
		".*/.eslint-print-configs/.*",

		// test data
		"^build-tools/packages/build-infrastructure/src/test/data/.*",

		// TODO: Once ESLint 9 flat configs are completely in use and the CJS configs are gone
		// we can remove these exceptions.
		".*/eslint.*.mts",
	],
	"no-js-file-extensions": [
		// PropertyDDS uses .js files which should be renamed eventually.
		"experimental/PropertyDDS/.*",
		"azure/packages/azure-local-service/index.js",

		// These oclif packages are still CJS vs. build-infrastructure which is ESM so is not excluded here.
		"build-tools/packages/build-cli/bin/dev.js",
		"build-tools/packages/build-cli/bin/run.js",
		"build-tools/packages/version-tools/bin/dev.js",
		"build-tools/packages/version-tools/bin/run.js",

		// Could be renamed, but there is tooling that uses this name and it's not worth it.
		"common/build/build-common/gen_version.js",

		// ESLint shared config and plugin
		"common/build/eslint-config-fluid/.*",
		"common/build/eslint-plugin-fluid/.*",

		"common/lib/common-utils/jest-puppeteer.config.js",
		"common/lib/common-utils/jest.config.js",

		// Avoids MIME-type issues in the browser.
		"docs/static/trusted-types-policy.js",
		"docs/static/dompurify/purify.min.js",
		"docs/static/js/add-code-copy-button.js",
		"examples/data-objects/monaco/loaders/blobUrl.js",
		"examples/data-objects/monaco/loaders/compile.js",
		"examples/service-clients/odsp-client/shared-tree-demo/tailwind.config.js",
		"packages/test/test-service-load/scripts/usePrereleaseDeps.js",

		// Changelog generator wrapper is in js
		"tools/changelog-generator-wrapper/src/getDependencyReleaseLine.js",
		"tools/changelog-generator-wrapper/src/getReleaseLine.js",
		"tools/changelog-generator-wrapper/src/index.js",

		"tools/getkeys/index.js",
	],
	"npm-package-json-scripts-args": [
		// server/routerlicious and server/routerlicious/packages/routerlicious use
		// linux only scripts that would require extra logic to validate properly.
		// Ideally no packages would use OS specific scripts.
		"^server/routerlicious/package.json",
		"^server/routerlicious/packages/routerlicious/package.json",
	],
	"npm-package-json-script-clean": [
		// eslint-config-fluid's build step generate printed configs that are checked in. No need to clean
		"common/build/eslint-config-fluid/package.json",
		// markdown-magic's build step update the README.md file that are checked in. No need to clean.
		"tools/markdown-magic/package.json",
	],
	"npm-package-json-script-mocha-config": [
		// these don't use mocha config for reporters yet.
		"^server/",
		"^build-tools/",
		"^common/lib/common-utils/package.json",
	],
	"npm-package-json-test-scripts": [
		"common/build/eslint-config-fluid/package.json",
		"packages/test/mocha-test-setup/package.json",
	],
	"npm-package-json-test-scripts-split": [
		"server/",
		"tools/",
		"package.json",
		"packages/test/test-service-load/package.json",
		"packages/tools/devtools/devtools-browser-extension/package.json",
		"packages/tools/devtools/devtools-view/package.json",
	],
	"npm-package-exports-apis-linted": [
		// Packages that violate the API linting rules
		// ae-missing-release-tags, ae-incompatible-release-tags
		"^examples/data-objects/table-document/",

		// Packages with APIs that don't need strict API linting
		"^build-tools/",
		"^common/build/",
		"^experimental/PropertyDDS/",
		"^tools/api-markdown-documenter/",
	],
	"npm-package-json-clean-script": [
		"server/gitrest/package.json",
		"server/historian/package.json",
		// getKeys has a fake tsconfig.json to make ./eslintrc.cjs work, but we don't need clean script
		"tools/getkeys/package.json",
		// this package has a irregular build pattern, so our clean script rule doesn't apply.
		"tools/markdown-magic/package.json",
		// Docs directory breaks cleaning down into multiple scripts.
		"docs/package.json",
	],
	"npm-strange-package-name": [
		"server/gitrest/package.json",
		"server/historian/package.json",
		"package.json",
	],
	"npm-package-readmes": [
		"server/gitrest/package.json",
		"server/historian/package.json",
		"package.json",
	],
	"npm-package-folder-name": [
		"server/gitrest/package.json",
		"server/historian/package.json",
		"package.json",
	],
	"npm-package-license": [
		// test packages
		"^build-tools/packages/build-infrastructure/src/test/data/testRepo/",
	],
	"npm-private-packages": [
		// TODO: Temporarily disabled for this package while it's a part of the client release group.
		"^common/build/eslint-config-fluid/",

		// test packages
		"^build-tools/packages/build-infrastructure/src/test/data/testRepo/",
	],
	"pnpm-npm-package-json-preinstall": [
		// test packages
		"^build-tools/packages/build-infrastructure/src/test/data/testRepo/",
	],
};

// Filter out disabled handlers
const activeHandlers = policyHandlers.filter((h) => !disabledHandlers.has(h.name));

// Convert FF handlers to repopo policy definitions
const fluidPolicies = fromFluidHandlers(activeHandlers);

// Map each converted policy to a policy() call with per-handler exclusions
const policies = fluidPolicies.map((policyDef) => {
	const exclusions = handlerExclusions[policyDef.name];
	if (exclusions !== undefined && exclusions.length > 0) {
		return policy(policyDef, { exclude: exclusions });
	}
	return policy(policyDef);
});

const config: RepopoConfig = {
	// Global exclusions (from fluidBuild.config.cjs policy.exclusions)
	excludeFiles: [
		// This file is a test file.
		"tools/markdown-magic/test/package.json",

		// Not a real package
		"docs/api/",

		// Source to output package.json files - not real packages
		// These should only be files that are not in an pnpm workspace.
		"common/build/build-common/src/cjs/package.json",
		"common/build/build-common/src/esm/package.json",
		"packages/common/core-interfaces/src/cjs/package.json",
		"packages/framework/presence/src/cjs/package.json",
	],
	policies,
};

export default config;
