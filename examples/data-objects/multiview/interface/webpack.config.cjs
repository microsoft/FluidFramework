/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const path = require("path");
const { merge } = require("webpack-merge");

module.exports = (env) => {
	const isProduction = env?.production;

	return merge(
		{
			entry: {
				main: "./src/index.ts",
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
				// https://github.com/webpack/webpack/issues/5767
				// https://github.com/webpack/webpack/issues/7939
				devtoolNamespace: "fluid-example/multiview-coordinate-interface",
				libraryTarget: "umd",
			},
		},
		isProduction ? require("./webpack.prod.cjs") : require("./webpack.dev.cjs"),
	);
};
