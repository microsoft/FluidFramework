/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const webpack = require("webpack");

module.exports = (env) => {
	const { production } = env;

	// Set PADDING_KB to inject a padding comment into the bundle for testing
	// the effect of bundle size on Lighthouse metrics. Example:
	//   npx webpack --env production --env paddingKb=500
	const paddingKb = Number(env.paddingKb) || 0;
	const plugins = [
		new HtmlWebpackPlugin({
			template: "./src/index.html",
		}),
	];

	if (paddingKb > 0) {
		plugins.push(
			new webpack.BannerPlugin({
				banner: `var __padding="${"x".repeat(paddingKb * 1024)}";`,
				raw: true,
			}),
		);
	}

	// When --env ballast is set, include the generated ballast barrel as an
	// additional entry so its parse/compile/execute cost is measured.  The
	// _generated/ directory is fully gitignored; only sweep.ts produces it.
	const entry = ["./src/app.ts"];
	if (env.ballast) {
		entry.push("./_generated/index.ts");
	}

	return {
		entry: {
			app: entry,
		},
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
			},
			extensions: [".ts", ".tsx", ".js", ".cjs", ".mjs"],
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
			devtoolNamespace: "fluid-example/tree-startup-perf",
			libraryTarget: "umd",
		},
		plugins,
		mode: production ? "production" : "development",
		devtool: production ? "source-map" : "inline-source-map",
	};
};
