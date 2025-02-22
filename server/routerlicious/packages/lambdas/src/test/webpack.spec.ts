/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import path from "path";
import webpack from "webpack";

// This config exists in order to test that webpack can fluid-lambdas-test (and thus its dependencies).
// To test actual use in a browser context integrate this package into a consumer that uses it in a browser context
// or add browser based tests to this package.

const config: webpack.Configuration = {
	entry: {
		"fluid-lambdas-test": path.resolve(__dirname, "../index.js"),
	},
	mode: "development",
	devtool: "inline-source-map",
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/,
			},
			{
				test: /\.m?js$/,
				use: [require.resolve("source-map-loader")],
				enforce: "pre",
			},
		],
	},
	resolve: {
		extensions: [".js"],
		fallback: {
			// Since this config is just used to test that code webpacks, and is not otherwise used,
			// minimize the dependencies/polyfills used.
			assert: false,
			buffer: false,
			util: false,
		},
	},
	output: {
		filename: "[name].bundle.js",
		path: path.resolve(__dirname, "../"),
		library: "FluidLambdasTest",
		libraryTarget: "umd",
	},
};

describe("Routerlicious.Lambdas", () => {
	it("Webpack build", async () => {
		await new Promise<void>((resolve, reject) => {
			webpack(config, (err, stats) => {
				if (err) {
					assert.fail(err);
				} else if (stats.hasErrors()) {
					assert.fail(stats.compilation.errors.map((value) => value.stack).join("\n"));
				} else {
					resolve();
				}
			});
		});
	}).timeout(10000);
});
