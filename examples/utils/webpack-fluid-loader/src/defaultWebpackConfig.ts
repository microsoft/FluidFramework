/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";

import { type WebpackConfiguration } from "webpack-dev-server";

import { RouteOptions } from "./loader.js";
import { devServerConfig } from "./routes.js";

/**
 * @returns A webpack config designed for conventional Fluid Framework examples within this repo.
 *
 * @remarks
 * Using this currently requires the package using it to take dev dependencies on "source-map-loader" and "ts-loader".
 *
 * Use like: `module.exports = (env) => fluidRoute.defaultWebpackConfig(__dirname, env);`
 *
 * If customizations are needed, use "webpack-merge" to adjust the configuration.
 *
 * @privateRemarks
 * TODO: FInd a way to make adding those dependencies to this package work.
 *
 * @internal
 */
export function defaultWebpackConfig(
	baseDir: string,
	env: RouteOptions & { production?: boolean },
): WebpackConfiguration {
	return {
		...devServerConfig(baseDir, env),
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
		module: {
			rules: [
				{
					test: /\.tsx?$/,
					loader: "ts-loader",
				},
				{
					test: /\.[cm]?js$/,
					use: [require.resolve("source-map-loader")],
					enforce: "pre",
				},
			],
		},
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(baseDir, "dist"),
			library: { name: "[name]", type: "umd" },
		},
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: env?.production ? "production" : "development",
		devtool: env?.production ? "source-map" : "inline-source-map",
	};
}
