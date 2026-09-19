/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "path";

import HtmlWebpackPlugin from "html-webpack-plugin";
import type { Configuration as WebpackConfiguration } from "webpack";
import type { Configuration as DevServerConfiguration } from "webpack-dev-server";

/**
 * A pattern matching the Axios browser CommonJS bundle, used to exclude it from source-map-loader.
 *
 * @remarks Axios publishes this bundle with a reference to `axios.cjs.map`, but does not include
 * that map in the package. Excluding only this bundle allows source-map-loader to process source
 * maps from other dependencies without emitting a missing-file warning for Axios.
 */
const axiosBrowserBundleWithoutSourceMap =
	/node_modules[/\\]axios[/\\]dist[/\\]browser[/\\]axios\.cjs$/;

/**
 * Environment options used to configure an example webpack build.
 * @internal
 */
export interface ExampleWebpackEnvironment {
	/** Whether to create an optimized production build. */
	production?: boolean;
	/** SEA artifact packaging selected at build time; defaults to split. */
	seaPreset?: "split" | "combined";
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
	/** Package-relative loader paths supplied by the ESM-specific configurations. */
	loaderPaths?: {
		/** Path to source-map-loader. */
		sourceMapLoader: string;
		/** Path to ts-loader. */
		typescriptLoader: string;
	};
}

/**
 * Creates the webpack-dev-server configuration shared by example applications.
 * @returns The shared webpack-dev-server configuration.
 * @internal
 */
export function createBaseDevServerConfig(): { devServer: DevServerConfiguration } {
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
export function createBaseExampleConfig(
	baseDir: string,
	env: ExampleWebpackEnvironment,
	options: BaseExampleConfigOptions = {},
): WebpackConfiguration {
	const { production } = env;
	return {
		...createBaseDevServerConfig(),
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
					loader: options.loaderPaths?.typescriptLoader ?? "ts-loader",
				},
				{
					test: /\.[cm]?js$/,
					exclude: axiosBrowserBundleWithoutSourceMap,
					use: [options.loaderPaths?.sourceMapLoader ?? "source-map-loader"],
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
