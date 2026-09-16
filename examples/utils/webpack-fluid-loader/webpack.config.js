/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import webpack from "webpack";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const mode = "development";

export default {
	entry: {
		"fluid-loader": path.resolve(dirname, "./src/loader.ts"),
	},
	mode,
	devtool: "inline-source-map",
	resolve: {
		extensionAlias: {
			".js": [".ts", ".tsx", ".js"],
			".cjs": [".cts", ".cjs"],
			".mjs": [".mts", ".mjs"],
		},
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: "ts-loader",
			},
			{
				test: /\.[cm]?js$/,
				use: [fileURLToPath(import.meta.resolve("source-map-loader"))],
				enforce: "pre",
			},
		],
	},
	// Some of Fluid's dependencies depend on process.env.NODE_ENV being defined.
	// This can be removed when we no longer get runtime errors like 'process is not defined'
	plugins: [
		new webpack.DefinePlugin({
			process: { env: { NODE_ENV: JSON.stringify(mode) } },
		}),
	],
	output: {
		filename: "[name].bundle.js",
		path: path.resolve(dirname, "bundle"),
		library: { name: "FluidLoader", type: "umd" },
	},
};
