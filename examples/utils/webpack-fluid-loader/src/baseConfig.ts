/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";

import HtmlWebpackPlugin from "html-webpack-plugin";
import type { Configuration as WebpackConfiguration } from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";

/**
 * Environment options used to configure an example webpack build.
 * @internal
 */
export interface ExampleWebpackEnvironment {
	/** Whether to create an optimized production build. */
	production?: boolean;
}

/**
 * Options for the loader-agnostic example webpack configuration.
 * @internal
 */
export interface BaseExampleConfigOptions {
	/**
	 * Configures the generated application page, or disables it when set to `false`.
	 * @defaultValue An application page with a `content` element.
	 */
	html?:
		| false
		| {
				/** The title of the generated application page. */
				title?: string;
		  };
}

/**
 * Creates the webpack-dev-server configuration shared by example applications.
 * @returns The shared webpack-dev-server configuration.
 * @internal
 */
export function baseDevServerConfig(): { devServer: DevServerConfiguration } {
	return {
		devServer: {
			static: false,
			devMiddleware: {
				publicPath: "/",
			},
		},
	};
}

/**
 * Creates a loader-agnostic webpack configuration suitable for an example application.
 * @param baseDir - The application directory containing its source and output folders.
 * @param env - Environment options for the webpack build.
 * @param options - Options for generated assets and other base configuration behavior.
 * @returns A webpack configuration for the example application.
 * @internal
 */
export function baseExampleConfig(
	baseDir: string,
	env: ExampleWebpackEnvironment,
	options: BaseExampleConfigOptions = {},
): WebpackConfiguration {
	const { production } = env;
	return {
		...baseDevServerConfig(),
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
					loader: require.resolve("ts-loader"),
				},
				{
					test: /\.[cm]?js$/,
					use: [require.resolve("source-map-loader")],
					enforce: "pre",
				},
			],
		},
		plugins:
			options.html === false
				? []
				: [
						new HtmlWebpackPlugin({
							title: options.html?.title ?? "Fluid example",
							templateContent: ({ htmlWebpackPlugin }) => `<!doctype html>
<html lang="en" style="height: 100%">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${htmlWebpackPlugin.options.title}</title>
	</head>
	<body style="margin: 0; height: 100%">
		<div id="content" style="min-height: 100%"></div>
	</body>
</html>`,
						}),
					],
		output: {
			filename: "[name].bundle.js",
			path: path.resolve(baseDir, "dist"),
		},
		watchOptions: {
			ignored: "**/node_modules/**",
		},
		mode: production === true ? "production" : "development",
		devtool: production === true ? "source-map" : "inline-source-map",
	};
}
