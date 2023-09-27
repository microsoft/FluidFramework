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
	private readonly secretsList = [
		"redis.pass",
		"redisForTenantCache.pass",
		"redis2.pass",
		"redisForThrottling.pass",
	];
	private readonly logger: ILogger | undefined;

	// Check library for issues/malware
	constructor(config: Record<string, any>, logger: ILogger | undefined, secretsList?: string[]) {
		this.config = JSON.parse(JSON.stringify(config));
		if (secretsList !== undefined) {
			this.secretsList = this.secretsList.concat(secretsList);
		}
		this.logger = logger;
	}

	public dumpConfig() {
		const redactJsonKeys = fastRedact({
			paths: this.secretsList,
			censor: errorSanitizationMessage,
			serialize: false,
		});

		try {
			redactJsonKeys(this.config);
			this.logger?.info(`Service config: ${JSON.stringify(this.config)}`);
		} catch (err) {
			Lumberjack.error(`Log sanitization failed.`, undefined, err);
		}
	}
}
