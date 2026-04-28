/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 */
//
// Flattened, declarative ship-only version of webpack.config.cts.
//
// Assumptions baked in:
//   - flavor === "ship"           (mode: "production", no source-map devtool conditionals)
//   - concatenateModules === true
//   - enableBundleAnalysis === false
//   - enableIncludeSourceMapsInBundles === false
//   - isIOS === false              (no iOS / "minimal" redirection bundle)
//
// Removed relative to webpack.config.cts:
//   - AzureDevOpsSymbolsPlugin
//   - externalizeTree flag / externals
//   - All polyfills (ProvidePlugin, NormalModuleReplacementPlugin, polyfill aliases)
//   - iOS-specific logic
//   - WORD_FLUID_IMPORTS alias (intentionally omitted)
//
import path from "node:path";

import TerserPlugin from "terser-webpack-plugin";
import { default as webpack } from "webpack";

const bundleName = "encapsulated-with-shared-tree.js";

const config: webpack.Configuration = {
	devtool: "source-map",
	entry: {
		[bundleName]: path.resolve(__dirname, "./src/index.ts"),
	},
	mode: "production",
	module: {
		rules: [
			{
				enforce: "pre",
				test: /\.(?:js|mjs|cjs)$/,
				use: ["source-map-loader"],
			},
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/,
			},
		],
	},
	name: bundleName,
	node: {
		global: true,
	},
	optimization: {
		concatenateModules: true,
		minimizer: [
			new TerserPlugin({
				extractComments: false,
				parallel: true,
				terserOptions: {
					format: {
						comments: false,
					},
				},
			}),
		],
		usedExports: true,
	},
	output: {
		filename: bundleName,
		library: {
			name: "encapsulatedWithSharedTree",
			type: "jsonp",
		},
		path: path.resolve(__dirname, "../../build/scenarios/encapsulated-with-shared-tree"),
	},
	plugins: [
		new webpack.optimize.LimitChunkCountPlugin({
			maxChunks: 1,
		}),
	],
	resolve: {
		extensionAlias: {
			".js": [".js", ".ts"],
		},
		extensions: [".tsx", ".ts", ".js"],
	},
};

export default config;
