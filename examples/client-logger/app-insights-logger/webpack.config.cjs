/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");

const HtmlWebpackPlugin = require("html-webpack-plugin");

const testAppSrcPath = path.join(__dirname, "src", "app");

module.exports = (env) => {
	const { production } = env;

	return {
		entry: {
			main: path.join(testAppSrcPath, "index.tsx"),
		},
		resolve: {
			extensionAlias: {
				".cjs": [".cts", ".cjs"],
				".js": [".ts", ".tsx", ".js"],
				".mjs": [".mts", ".mjs"],
			},
			extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: require.resolve("ts-loader"),
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
			library: "[name]",
			devtoolNamespace: "fluid-tools/client-debugger-view",
			libraryTarget: "umd",
		},
		plugins: [new HtmlWebpackPlugin({ template: path.join(testAppSrcPath, "index.html") })],
		// This impacts which files are watched by the dev server (and likely by webpack if watch is true).
		// This should be configurable under devServer.static.watch
		// (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
		// The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
	};
};
