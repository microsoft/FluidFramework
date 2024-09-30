/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from "debug";
import * as winston from "winston";
import nconf from "nconf";
// eslint-disable-next-line @typescript-eslint/no-require-imports
import Transport = require("winston-transport");
import {
	ILumberjackEngine,
	ILumberjackSchemaValidator,
	Lumberjack,
	ILumberjackOptions,
} from "@fluidframework/server-services-telemetry";
import { WinstonLumberjackEngine } from "./winstonLumberjackEngine";
import { configureGlobalTelemetryContext } from "./globalContext";

/**
 * @internal
 */
export interface IWinstonConfig {
	colorize: boolean;
	json: boolean;
	label: string;
	level: string;
	timestamp: boolean;
	additionalTransportList?: Transport[];
}
const defaultWinstonConfig: IWinstonConfig = {
	colorize: true,
	json: false,
	level: "info",
	timestamp: true,
	label: "winston",
};
function configureWinstonLogging(config: IWinstonConfig): void {
	const formatters = [winston.format.label({ label: config.label })];

	if (config.colorize) {
		formatters.push(winston.format.colorize());
	}

	if (config.timestamp) {
		formatters.push(winston.format.timestamp());
	}

	if (config.json) {
		formatters.push(winston.format.json());
	} else {
		formatters.push(winston.format.simple());
	}

	winston.configure({
		format: winston.format.combine(...formatters),
		transports: [
			new winston.transports.Console({
				handleExceptions: true,
				level: config.level,
			}),
		],
	});
	if (config.additionalTransportList) {
		for (const transport of config.additionalTransportList) {
			winston.add(transport);
		}
	}
}

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
function configureLumberjackLogging(config: ILumberjackConfig) {
	if (config.options?.enableGlobalTelemetryContext) {
		configureGlobalTelemetryContext();
	}
	Lumberjack.setup(config.engineList, config.schemaValidator, config.options);
}

/**
 * Configures the default behavior of the Winston logger and Lumberjack based on the provided config
 * @internal
 */
export function configureLogging(configOrPath: nconf.Provider | string) {
	const config =
		typeof configOrPath === "string"
			? nconf
					.argv()
					.env({ separator: "__", parseValues: true })
					.file(configOrPath)
					.use("memory")
			: configOrPath;

	const winstonConfig: IWinstonConfig = {
		...defaultWinstonConfig,
		...(config.get("logger") as Partial<IWinstonConfig>),
	};
	configureWinstonLogging(winstonConfig);

	const lumberjackConfig: ILumberjackConfig = {
		...defaultLumberjackConfig,
		...(config.get("lumberjack") as Partial<ILumberjackConfig>),
	};
	lumberjackConfig.options = {
		...defaultLumberjackConfig.options,
		...lumberjackConfig.options,
	};
	configureLumberjackLogging(lumberjackConfig);

	// Forward all debug library logs through winston and Lumberjack
	(debug as any).log = function (msg, ...args) {
		winston.info(msg, ...args);
		Lumberjack.info(msg, { args: JSON.stringify(args) });
	};
	// Override the default log format to not include the timestamp since winston and Lumberjack will do this for us
	(debug as any).formatArgs = function (args) {
		const name = this.namespace;
		args[0] = `${name} ${args[0]}`;
	};
}
