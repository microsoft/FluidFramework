/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import crypto from "crypto";
import fs from "fs";

import { ITelemetryBufferedLogger } from "@fluid-internal/test-driver-definitions";
import { ITelemetryBaseEvent, LogLevel } from "@fluidframework/core-interfaces";
import { assert, LazyPromise } from "@fluidframework/core-utils/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { pkgName, pkgVersion } from "./packageVersion.js";

export class FileLogger implements ITelemetryBufferedLogger {
	private static readonly loggerP = new LazyPromise<FileLogger>(async () => {
		if (process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER !== undefined) {
			await import(process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER);
			const logger = getTestLogger?.();
			assert(logger !== undefined, "Expected getTestLogger to return something");
			return new FileLogger(logger);
		} else {
			return new FileLogger(undefined);
		}
	});

	public static async createLogger(dimensions: {
		driverType: string;
		driverEndpointName: string | undefined;
		profile: string;
		runId: number | undefined;
	}) {
		return createChildLogger({
			logger: await this.loggerP,
			properties: {
				all: dimensions,
			},
		});
	}

	public static async flushLogger(runInfo?: { url: string; runId?: number }) {
		await (await this.loggerP).flush(runInfo);
	}

	private error: boolean = false;
	private readonly schema = new Map<string, number>();
	private logs: ITelemetryBaseEvent[] = [];
	public readonly minLogLevel: LogLevel = LogLevel.verbose;

	private constructor(private readonly baseLogger?: ITelemetryBufferedLogger) {}

	async flush(runInfo?: { url: string; runId?: number }): Promise<void> {
		const baseFlushP = this.baseLogger?.flush();

		if (this.error && runInfo !== undefined) {
			const logs = this.logs;
			const outputDir = `${__dirname}/output/${crypto
				.createHash("md5")
				.update(runInfo.url)
				.digest("hex")}`;
			if (!fs.existsSync(outputDir)) {
				fs.mkdirSync(outputDir, { recursive: true });
			}
			// sort from most common column to least common
			const schema = [...this.schema].sort((a, b) => b[1] - a[1]).map((v) => v[0]);
			const data = logs.reduce(
				(file, event) =>
					// eslint-disable-next-line @typescript-eslint/no-base-to-string
					`${file}\n${schema.reduce((line, k) => `${line}${event[k] ?? ""},`, "")}`,
				schema.join(","),
			);
			const filePath = `${outputDir}/${runInfo.runId ?? "orchestrator"}_${Date.now()}.csv`;
			fs.writeFileSync(filePath, data);
		}
		this.schema.clear();
		this.error = false;
		this.logs = [];
		return baseFlushP;
	}
	send(event: ITelemetryBaseEvent): void {
		if (typeof event.testCategoryOverride === "string") {
			event.category = event.testCategoryOverride;
		} else if (
			typeof event.message === "string" &&
			event.message.includes("FaultInjectionNack")
		) {
			event.category = "generic";
		}
		this.baseLogger?.send({ ...event, hostName: pkgName, testVersion: pkgVersion });

		event.Event_Time = Date.now();
		// keep track of the frequency of every log event, as we'll sort by most common on write
		Object.keys(event).forEach((k) => this.schema.set(k, (this.schema.get(k) ?? 0) + 1));
		if (event.category === "error") {
			this.error = true;
		}
		this.logs.push(event);
	}
}
