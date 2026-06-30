/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import TerserPlugin from "terser-webpack-plugin";
import { default as webpack } from "webpack";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

const bundleName = "encapsulated-no-tree.js";

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
			name: "encapsulatedNoTree",
			type: "jsonp",
		},
		path: path.resolve(__dirname, "../../build/scenarios/encapsulated-no-tree"),
	},
	plugins: [
		new webpack.optimize.LimitChunkCountPlugin({
			maxChunks: 1,
		}),
		// Emit the per-asset analyzer.json (statSize/parsedSize/gzipSize) that
		// 'flub generate bundleAnalysisRepo' collects for the bundle-size comparison. Written under
		// this directory (__dirname) so it lands in the webpack-dir's bundleAnalyzerJson regardless of cwd.
		new BundleAnalyzerPlugin({
			analyzerMode: "json",
			reportFilename: path.resolve(__dirname, "bundleAnalyzerJson", "analyzer.json"),
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
