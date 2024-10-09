/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { BundleComparisonPlugin } = require("@mixer/webpack-bundle-compare/dist/plugin");
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
const DuplicatePackageCheckerPlugin = require("@cerner/duplicate-package-checker-webpack-plugin");
const { BannedModulesPlugin } = require("@fluidframework/bundle-size-tools");
const {
	isInternalVersionScheme,
	fromInternalScheme,
	toInternalScheme,
} = require("@fluid-tools/version-tools");

// We need to replace the version string in the bundled code (in the packageVersion.ts files); otherwise the bundle we build in CI for PRs will have the
// updated version string, which will not match the one in the main bundle. This will cause the bundle comparison to be
// incorrect.
const pkg = require("./package.json");

// An array of webpack module rules. We build the list of rules dynamically depending on the version scheme used by the
// package.
const webpackModuleRules = [];

// Read the version from an environment variable, if set. The version in the package.json file will be used otherwise.
const verString = process.env.SETVERSION_VERSION ?? pkg.version;

// If the version is a Fluid internal version, then we want to replace the version string in the bundled code. Otherwise
// we leave the versions as-is.
if (isInternalVersionScheme(verString, true, true)) {
	const [publicVer, { major, minor, patch }] = fromInternalScheme(verString, true, true);
	const versionToReplace = new RegExp(verString, "g");
	const internalVersionNoPrerelease = [major, minor, patch].join(".");
	const newVersion = toInternalScheme(publicVer, internalVersionNoPrerelease).version;

	// This rule replaces the version string in the bundled code.
	webpackModuleRules.push({
		test: /packageVersion\.js$/,
		loader: "string-replace-loader",
		options: {
			search: versionToReplace,
			replace: newVersion,
			// If true, webpack will fail if the search string is not found in the file. Since we have some files that
			// don't have the version numbers, we need to set this to false.
			strict: false,
		},
	});
} else {
	console.warn(
		`The version string ${verString} is not a Fluid internal version string. The version string in the bundled code will not be replaced.`,
	);
}

// Always use these module rules
webpackModuleRules.push(
	{
		test: /\.tsx?$/,
		use: "ts-loader",
		exclude: /node_modules/,
	},
	{
		test: /\.m?js$/,
		use: [require.resolve("source-map-loader")],
		enforce: "pre",
	},
);

module.exports = {
	entry: {
		aqueduct: "./src/aqueduct",
		azureClient: "./src/azureClient",
		connectionState: "./src/connectionState",
		containerRuntime: "./src/containerRuntime",
		fluidFramework: "./src/fluidFramework",
		loader: "./src/loader",
		map: "./src/map",
		matrix: "./src/matrix",
		odspClient: "./src/odspClient",
		odspDriver: "./src/odspDriver",
		odspPrefetchSnapshot: "./src/odspPrefetchSnapshot",
		sharedString: "./src/sharedString",
		sharedTree: "./src/sharedTree",
	},
	mode: "production",
	module: {
		rules: webpackModuleRules,
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js"],
	},
	output: {
		path: path.resolve(__dirname, "dist"),
		library: "bundle",
	},
	node: false,
	plugins: [
		new BannedModulesPlugin({
			bannedModules: [
				{
					moduleName: "assert",
					reason:
						"This module is very large when bundled in browser facing Javascript, instead use the assert API in @fluidframework/common-utils",
				},
			],
		}),
		new DuplicatePackageCheckerPlugin({
			// Also show module that is requiring each duplicate package
			verbose: true,
			// Emit errors instead of warnings
			emitError: true,
			/**
			 * We try to avoid duplicate packages, but sometimes we have to allow them since the duplication is coming from a third party library we do not control
			 * IMPORTANT: Do not add any new exceptions to this list without first doing a deep investigation on why a PR adds a new duplication, this hides a bundle size issue
			 */
			exclude: (instance) =>
				// object-is depends on es-abstract 1.18.0-next, which does not satisfy the semver of other packages. We should be able to remove this when es-abstract moves to 1.18.0
				instance.name === "es-abstract",
		}),
		new BundleAnalyzerPlugin({
			analyzerMode: "static",
			reportFilename: path.resolve(process.cwd(), "bundleAnalysis/report.html"),
			openAnalyzer: false,
			generateStatsFile: true,
			statsFilename: path.resolve(process.cwd(), "bundleAnalysis/report.json"),
		}),
		// Plugin that generates a compressed version of the stats file that can be uploaded to blob storage
		new BundleComparisonPlugin({
			// File to create, relative to the webpack build output path:
			file: path.resolve(process.cwd(), "bundleAnalysis/bundleStats.msp.gz"),
		}),
	],
	// Enabling source maps allows using source-map-explorer to investigate bundle contents,
	// which provides more fine grained details than BundleAnalyzerPlugin, so its nice for manual investigations.
	devtool: "source-map",
};
