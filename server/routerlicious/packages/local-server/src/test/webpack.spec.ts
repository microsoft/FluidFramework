/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import path from "path";
import webpack from "webpack";

// This config exists in order to test that webpack can pack local server.
// To test actual use in a browser context integrate this package into a consumer that uses it in a browser context
// or add browser based tests to this package.

const config: webpack.Configuration = {
	entry: {
		main: "./src/index.ts",
	},
	mode: "production",
	devtool: "source-map",
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				use: "ts-loader",
				exclude: /node_modules/,
			},
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".js"],
		fallback: {
			// Since this config is just used to test that local-server webpacks, and is not otherwise used,
			// minimize the dependencies/polyfills used.
			buffer: false,
			util: false,
		},
	},
	output: {
		filename: "[name].bundle.js",
		path: path.resolve(__dirname, "dist"),
		library: "[name]",
		libraryTarget: "umd",
	},
};

describe("Local server", () => {
	it("Webpack build", async () => {
		await new Promise<void>((resolve, reject) => {
			webpack(config, (err, stats) => {
				if (err) {
					assert.fail(err);
				} else if (stats === undefined) {
					assert.fail(new Error("No stats"));
				} else if (stats.hasErrors()) {
					assert.fail(stats.compilation.errors.map((value) => value.stack).join("\n"));
				} else {
					resolve();
				}
			});
		});
	}).timeout(30000);
});
