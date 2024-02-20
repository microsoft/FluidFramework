/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const path = require("path");
const { merge } = require("webpack-merge");
const webpack = require("webpack");

module.exports = (env) => {
	const isProduction = env?.production;
	const styleLocalIdentName = isProduction ? "[hash:base64:5]" : "[local]-[hash:base64:5]";

	return merge(
		{
			entry: "./src/index.ts",
			resolve: {
				extensionAlias: {
					".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
				},
				extensions: [".mjs", ".ts", ".tsx", ".js"],
				fallback: {
					dgram: false,
					fs: false,
					net: false,
					tls: false,
					child_process: false,
				},
			},
			devtool: "source-map",
			mode: "production",
			module: {
				rules: [
					{
						test: /\.tsx?$/,
						use: [
							{
								loader: "ts-loader",
								options: {
									compilerOptions: {
										module: "esnext",
									},
								},
							},
						],
						exclude: /node_modules/,
					},
					{
						test: /\.m?js$/,
						use: [require.resolve("source-map-loader")],
						enforce: "pre",
					},
					{
						test: /\.css$/,
						use: [
							"style-loader",
							{
								loader: "css-loader",
								options: {
									modules: true,
									localIdentName: styleLocalIdentName,
								},
							},
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
				chunkFilename: "[name].async.js",
				path: path.resolve(__dirname, "dist"),
				publicPath: "/dist/",
				library: "[name]",
				libraryTarget: "umd",
				globalObject: "self",
			},
			plugins: [
				new webpack.ProvidePlugin({
					process: "process/browser",
				}),
			],
			// This impacts which files are watched by the dev server (and likely by webpack if watch is true).
			// This should be configurable under devServer.static.watch
			// (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
			// The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
			watchOptions: {
				ignored: "**/node_modules/**",
			},
		},
		isProduction ? require("./webpack.prod.cjs") : require("./webpack.dev.cjs"),
		fluidRoute.devServerConfig(__dirname, env),
	);
};
