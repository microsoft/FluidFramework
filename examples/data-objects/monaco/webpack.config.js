/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { devServerConfig } from "@fluid-example/webpack-fluid-loader";
import MonacoWebpackPlugin from "monaco-editor-webpack-plugin";

const dirname = path.dirname(fileURLToPath(import.meta.url));

export default (env) => {
	return {
		...devServerConfig(dirname, env),
		entry: {
			main: "./src/index.ts",
		},
		resolve: {
			extensionAlias: {
				".js": [".ts", ".tsx", ".js"],
				".cjs": [".cts", ".cjs"],
				".mjs": [".mts", ".mjs"],
			},
		},
		resolveLoader: {
			alias: {
				"blob-url-loader": fileURLToPath(import.meta.resolve("./loaders/blobUrl.js")),
				"compile-loader": fileURLToPath(import.meta.resolve("./loaders/compile.js")),
			},
		},
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
				// This example currently has missing sourcemap issues.
				// Disabling source mapping allows it to be runnable with these issues.
				// {
				// 	test: /\.[cm]?js$/,
				// 	use: [require.resolve("source-map-loader")],
				// 	enforce: "pre",
				// },
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
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(dirname, "bundle"),
			library: { name: "[name]", type: "umd" },
			chunkFilename: "[name].async.js",
			publicPath: "/app/",
			globalObject: "self",
		},
		plugins: [new MonacoWebpackPlugin()],
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: env?.production ? "production" : "development",
		devtool: env?.production ? "source-map" : "inline-source-map",
	};
};
