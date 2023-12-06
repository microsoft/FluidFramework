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

	// Check library for issues/malware
	constructor(
		config: Record<string, any>,
		logger?: ILogger,
		secretNamesToRedactInConfigDump?: string[],
	) {
		this.config = config;
		if (secretNamesToRedactInConfigDump !== undefined) {
			this.secretNamesToRedactInConfigDump = this.secretNamesToRedactInConfigDump.concat(
				secretNamesToRedactInConfigDump,
			);
		}
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
			Lumberjack.error(`Log sanitization failed.`, undefined, err);
		}
	}
}
