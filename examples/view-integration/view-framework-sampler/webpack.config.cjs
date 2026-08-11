/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = (env) => {
	const { production } = env;

	return {
		entry: {
			app: "./src/app.ts",
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(__dirname, "dist"),
			library: "[name]",
			// https://github.com/webpack/webpack/issues/5767
			// https://github.com/webpack/webpack/issues/7939
			devtoolNamespace: "fluid-example/dice-roller",
			libraryTarget: "umd",
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
			new HtmlWebpackPlugin({
				template: "./src/index.html",
			}),
			new webpack.DefinePlugin({
				// These are not required, but the Vue docs recommend setting them.
				// See https://vuejs.org/api/compile-time-flags.html#webpack
				__VUE_OPTIONS_API__: "true",
				__VUE_PROD_DEVTOOLS__: "false",
				__VUE_PROD_HYDRATION_MISMATCH_DETAILS__: "false",
			}),
		],
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			},
			extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			alias: {
				vue$: "vue/dist/vue.esm-bundler.js",
			},
		},
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
	};
};
