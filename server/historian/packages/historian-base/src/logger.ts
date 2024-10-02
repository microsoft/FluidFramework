/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import nconf, { Provider } from "nconf";
import { WinstonLumberjackEngine } from "@fluidframework/server-services-utils";
import {
	ILumberjackEngine,
	ILumberjackOptions,
	ILumberjackSchemaValidator,
	Lumberjack,
} from "@fluidframework/server-services-telemetry";

// TODO: this is mostly duplicate code from `@fluidframework/server-services-utils` configureLogging()
// to avoid adding duplicate transports to the global `winston` instance. This should just call
// configureLogging() once global winston usage is removed in favor of Lumberjack.
// Also, once `enableGlobalTelemetryContext` is default to `true` this will be unnecessary.

export interface ILumberjackConfig {
	engineList: ILumberjackEngine[];
	schemaValidator?: ILumberjackSchemaValidator[];
	options?: Partial<ILumberjackOptions>;
}
const defaultLumberjackConfig: ILumberjackConfig = {
	engineList: [new WinstonLumberjackEngine()],
	schemaValidator: undefined,
	options: {
		enableGlobalTelemetryContext: true,
		enableSanitization: false,
	},
};

/**
 * Helps to avoid package version mismatch issues with usage of global Lumberjack instance.
 * Configures the default behavior of the Winston and Lumberjack loggers based on the provided config.
 *
 * IMPORTANT: call this after `configureLogging` has been called, if calling both, so that Lumberjack is not
 * setup twice, which will throw an error. `configureLogging` does not do a safety check when setting up Lumberjack.
 */
export function configureHistorianLogging(configOrPath: Provider | string) {
	// If package versions are not mismatched, this check will ensure this function does nothing.
	if (Lumberjack.isSetupCompleted()) {
		return;
	}
	const config =
		typeof configOrPath === "string"
			? nconf
					.argv()
					.env({ separator: "__", parseValues: true })
					.file(configOrPath)
					.use("memory")
			: configOrPath;

	const lumberjackConfig: ILumberjackConfig = {
		...defaultLumberjackConfig,
		...(config.get("lumberjack") as Partial<ILumberjackConfig>),
	};
	lumberjackConfig.options = {
		...defaultLumberjackConfig.options,
		...lumberjackConfig.options,
	};
	Lumberjack.setup(
		lumberjackConfig.engineList,
		lumberjackConfig.schemaValidator,
		lumberjackConfig.options,
	);
}
