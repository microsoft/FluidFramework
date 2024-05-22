/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const { merge } = require("webpack-merge");
const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");

module.exports = (env) => {
	const baseConfig = fluidRoute.defaultWebpackConfig(__dirname, env);

	// This example currently has missing sourcemap issues.
	// Disabling source mapping allows it to be runnable with these issues.
	const baseRules = baseConfig.module.rules;

	// Check the source-mapping rule is still at the expected index in the base config
	if (baseRules[1].use[0] !== require.resolve("source-map-loader")) {
		throw new Error("Disabling source mapping failed");
	}
	// Remove source mapping rule
	baseRules.splice(1);

	return merge(baseConfig, {
		module: {
			rules: [
				{
					test: /\.css$/,
					use: [
						"style-loader", // creates style nodes from JS strings
						"css-loader", // translates CSS into CommonJS
					],
				},
				{
					test: /\.scss$/,
					use: [
						"style-loader", // creates style nodes from JS strings
						"css-loader", // translates CSS into CommonJS
						"sass-loader", // compiles Sass to CSS, using Node Sass by default
					],
				},
				{
					test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
					loader: "url-loader",
					options: {
						limit: 10000,
					},
				},
				{
					test: /\.html$/,
					loader: "html-loader",
				},
			],
		},
		resolveLoader: {
			alias: {
				"blob-url-loader": require.resolve("./loaders/blobUrl"),
				"compile-loader": require.resolve("./loaders/compile"),
			},
		},
		output: {
			chunkFilename: "[name].async.js",
			publicPath: "/dist/",
			globalObject: "self",
		},
		plugins: [new MonacoWebpackPlugin()],
	});
};
