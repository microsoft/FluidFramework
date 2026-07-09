/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

const fluidRoute = require("@fluid-example/webpack-fluid-loader");
const webpack = require("webpack");
const { merge } = require("webpack-merge");

module.exports = (env) =>
	merge(fluidRoute.commonExampleConfig(__dirname, env), {
		resolve: {
			fallback: {
				dgram: false,
				fs: false,
				net: false,
				tls: false,
				child_process: false,
			},
		},
		module: {
			rules: [
				{
					test: /\.less$/,
					use: [
						{
							loader: "style-loader", // creates style nodes from JS strings
						},
						{
							loader: "css-loader", // translates CSS into CommonJS
						},
						{
							loader: "less-loader", // compiles Less to CSS
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
			],
		},
		plugins: [
			new webpack.ProvidePlugin({
				process: "process/browser.js",
			}),
		],
	});
