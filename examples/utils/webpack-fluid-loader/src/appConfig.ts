/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProvidePlugin, type Configuration as WebpackConfiguration } from "webpack";

import {
	baseExampleConfig,
	type BaseExampleConfigOptions,
	type ExampleWebpackEnvironment,
} from "./baseConfig.js";

/**
 * Creates a webpack configuration for a self-hosted Fluid example application.
 *
 * @remarks
 * This configuration is designed to work with
 * {@link @fluid-example/example-utils#getExampleServiceClient}. In particular, it provides the
 * browser compatibility required when that helper selects its ephemeral local-driver service.
 *
 * @param baseDir - The application directory containing its source and output folders.
 * @param env - Environment options for the webpack build.
 * @param options - Options for generated assets and other base configuration behavior.
 * @returns A webpack configuration for the example application.
 * @internal
 */
export function exampleAppConfig(
	baseDir: string,
	env: ExampleWebpackEnvironment,
	options: BaseExampleConfigOptions = {},
): WebpackConfiguration {
	const config = baseExampleConfig(baseDir, env, options);

	return {
		...config,
		plugins: [
			...(config.plugins ?? []),
			// TODO: Remove this polyfill once local-driver no longer loads Node's util package in
			// browser bundles. local-driver imports TestHistorian from the CommonJS root of
			// server-test-utils, which eagerly loads TestContext, assert, and then util. util reads
			// process.env.NODE_DEBUG during module initialization.
			new ProvidePlugin({ process: require.resolve("process/browser.js") }),
		],
	};
}
