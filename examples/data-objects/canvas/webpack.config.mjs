/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { commonExampleConfig } from "@fluid-example/webpack-fluid-loader";
import webpack from "webpack";
import { merge } from "webpack-merge";

export default (env) =>
	merge(commonExampleConfig(import.meta.dirname, env), {
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
