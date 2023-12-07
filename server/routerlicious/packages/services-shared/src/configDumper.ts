/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fastRedact from "fast-redact";
import { ILogger } from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
const errorSanitizationMessage = "FluidREDACTED";

export class ConfigDumper {
	private readonly config: Record<string, any>;
	private readonly secretNamesToRedactInConfigDump = [
		"mongo.globalDbEndpoint",
		"mongo.operationsDbEndpoint",
		"redis.pass",
		"redisForTenantCache.pass",
		"redis2.pass",
		"redisForThrottling.pass",
	];
	private readonly logger: ILogger | undefined;

	constructor(
		config: Record<string, any>,
		logger?: ILogger,
		secretNamesToRedactInConfigDump?: string[],
	) {
		// Create a deep copy of the config so that we can redact values without affecting the original config.
		this.config = JSON.parse(JSON.stringify(config));
		if (secretNamesToRedactInConfigDump !== undefined) {
			this.secretNamesToRedactInConfigDump = this.secretNamesToRedactInConfigDump.concat(
				secretNamesToRedactInConfigDump,
			);
		}
		// Ensure unique redaction keys.
		this.secretNamesToRedactInConfigDump = Array.from(
			new Set(this.secretNamesToRedactInConfigDump),
		);
		this.logger = logger;
	}

	public getConfig(): Record<string, any> {
		return this.config;
	}

	public dumpConfig() {
		const redactJsonKeys = fastRedact({
			paths: this.secretNamesToRedactInConfigDump,
			censor: errorSanitizationMessage,
			serialize: false,
		});

		try {
			redactJsonKeys(this.config);
			this.logger?.info(`Service config: ${JSON.stringify(this.config)}`);
			Lumberjack.info(`Service config`, this.config);
		} catch (err) {
			this.logger?.error(`Log sanitization failed.`, err);
			Lumberjack.error(`Log sanitization failed.`, undefined, err);
		}
	}
}
