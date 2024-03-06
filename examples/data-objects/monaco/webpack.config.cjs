/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const path = require("path");
const { merge } = require("webpack-merge");
const MonacoWebpackPlugin = require("monaco-editor-webpack-plugin");

module.exports = (env) => {
	const isProduction = env?.production;
	return merge(
		{
			entry: {
				main: "./src/index.ts",
			},
			mode: "production",
			devtool: "source-map",
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
					// This example currently has missing sourcemap issues.
					// Disabling source mapping allows it to be runnable with these issues.
					// {
					//     test: /\.m?js$/,
					//     use: [require.resolve("source-map-loader")],
					//     enforce: "pre"
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
			resolve: {
				extensionAlias: {
					".js": [".ts", ".tsx", ".js", ".cjs", ".mjs"],
				},
				extensions: [".tsx", ".ts", ".js"],
			},
			resolveLoader: {
				alias: {
					"blob-url-loader": require.resolve("./loaders/blobUrl"),
					"compile-loader": require.resolve("./loaders/compile"),
				},
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
			devServer: {
				host: "0.0.0.0",
			},
			// This impacts which files are watched by the dev server (and likely by webpack if watch is true).
			// This should be configurable under devServer.static.watch
			// (see https://github.com/webpack/webpack-dev-server/blob/master/migration-v4.md) but that does not seem to work.
			// The CLI options for disabling watching don't seem to work either, so this may be a symptom of using webpack4 with the newer webpack-cli and webpack-dev-server.
			watchOptions: {
				ignored: "**/node_modules/**",
			},
			plugins: [
				new MonacoWebpackPlugin(),
				// new BundleAnalyzerPlugin()
			],
		},
		isProduction ? require("./webpack.prod.cjs") : require("./webpack.dev.cjs"),
		fluidRoute.devServerConfig(__dirname, env),
	);
};
