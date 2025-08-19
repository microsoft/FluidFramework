/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const HtmlWebpackPlugin = require("html-webpack-plugin");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const webpack = require("webpack");
const path = require("path");

module.exports = {
	mode: "development",
	entry: "./src/test/mocha/browser.spec.ts",
	output: {
		filename: "bundle.js",
		path: path.resolve(__dirname, "dist-browser"),
		clean: true,
	},
	resolve: {
		extensions: [".ts", ".js"],
		extensionAlias: {
			".js": [".js", ".ts"],
		},
		alias: {
			"process/browser": require.resolve("process/browser"),
			"process": require.resolve("process/browser"),
			"./dirname.cjs": path.resolve(__dirname, "src/test/mocha/dirname.cjs"),
		},
		fallback: {
			fs: false,
			"node:fs": false,
			"path-browserify": require.resolve("path-browserify"),
			assert: require.resolve("assert/"),
			path: require.resolve("path-browserify"),
			crypto: require.resolve("crypto-browserify"),
			stream: require.resolve("stream-browserify"),
			util: require.resolve("util"),
			buffer: require.resolve("buffer"),
			events: require.resolve("events"),
			url: require.resolve("url"),
			http: require.resolve("stream-http"),
			https: require.resolve("https-browserify"),
			os: require.resolve("os-browserify"),
			zlib: require.resolve("browserify-zlib"),
		},
	},
	plugins: [
		new NodePolyfillPlugin({
			excludeAliases: ["console"],
		}),
		new HtmlWebpackPlugin({
			template: "./src/test/index.html",
			filename: "index.html",
		}),
		new webpack.ProvidePlugin({
			process: "process/browser",
			Buffer: ["buffer", "Buffer"],
		}),
		new webpack.DefinePlugin({
			"process.env.NODE_ENV": JSON.stringify("development"),
			global: "globalThis",
		}),
		// Simple node: scheme handler - just remove the prefix and let fallbacks handle it
		new webpack.NormalModuleReplacementPlugin(/^node:(.+)$/, (resource) => {
			resource.request = resource.request.replace(/^node:/, "");
		}),
		// Add plugin to handle workspace modules that can't be browserified
		new webpack.IgnorePlugin({
			checkResource(resource, context) {
				// Ignore problematic imports from test-dds-utils
				if (context && context.includes("test-dds-utils")) {
					if (resource === "node:fs" || resource === "fs") {
						return true;
					}
				}
				return false;
			},
		}),
	],
	module: {
		rules: [
			{
				test: /\.m?js$/,
				resolve: {
					fullySpecified: false,
				},
			},
			{
				test: /\.ts$/,
				use: {
					loader: "ts-loader",
					options: {
						configFile: false,
						ignoreDiagnostics: [6059],
						compilerOptions: {
							target: "es2017",
							module: "esnext",
							moduleResolution: "bundler",
							allowJs: true,
							esModuleInterop: true,
							skipLibCheck: true,
							resolveJsonModule: true,
							allowSyntheticDefaultImports: true,
							declaration: false,
							declarationMap: false,
							noEmit: false,
							lib: ["dom", "es2017"],
							types: ["mocha"],
							rootDir: undefined,
							baseUrl: ".",
							paths: {},
						},
					},
				},
				exclude: /node_modules/,
			},
			{
				test: /\.js$/,
				use: {
					loader: "babel-loader",
					options: {
						presets: ["@babel/preset-env"],
					},
				},
				exclude: /node_modules/,
			},
		],
	},
	devServer: {
		static: {
			directory: path.join(__dirname, "dist-browser"),
		},
		compress: true,
		port: 8080,
		open: false,
		hot: false,
		liveReload: false,
	},
	optimization: {
		concatenateModules: false,
		usedExports: false,
		sideEffects: false,
	},
	devtool: "inline-source-map",
};
