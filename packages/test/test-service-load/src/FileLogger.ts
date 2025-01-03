/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";

import type { ITelemetryBufferedLogger } from "@fluid-internal/test-driver-definitions";
import { type ITelemetryBaseEvent, LogLevel } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import { createChildLogger } from "@fluidframework/telemetry-utils/internal";

import { pkgName, pkgVersion } from "./packageVersion.js";

// This test expects that if a certain env variable is specified, it points to a package that exports
// a "createTestLogger" function.
// Generally speaking, this logger will be the one that actually knows how to log to a real
// destination (i.e. aria-logger).
// TODO: Consider injecting a logger rather than relying on an environment variable and dynamic import.
const createInjectedLoggerIfExists = async (): Promise<
	ITelemetryBufferedLogger | undefined
> => {
	if (process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER !== undefined) {
		// We expect that the specified package provides a createTestLogger function.
		const { createTestLogger } = await import(process.env.FLUID_TEST_LOGGER_PKG_SPECIFIER);
		assert(
			typeof createTestLogger === "function",
			"A createTestLogger function was not provided from the specified package",
		);
		return createTestLogger() as ITelemetryBufferedLogger;
	}
	return undefined;
};

export const createLogger = async (
	outputDirectoryPath: string,
	fileNamePrefix: string,
	dimensions: {
		driverType: string;
		driverEndpointName: string | undefined;
		profile: string;
		runId: number | undefined;
	},
) => {
	const baseLogger = await createInjectedLoggerIfExists();
	const fileLogger = new FileLogger(outputDirectoryPath, fileNamePrefix, baseLogger);
	const childLogger = createChildLogger({
		logger: fileLogger,
		properties: {
			all: dimensions,
		},
	});
	return { logger: childLogger, flush: async () => fileLogger.flush() };
};

class FileLogger implements ITelemetryBufferedLogger {
	private readonly schema = new Map<string, number>();
	private logs: ITelemetryBaseEvent[] = [];
	public readonly minLogLevel: LogLevel = LogLevel.verbose;

	public constructor(
		private readonly outputDirectoryPath: string,
		private readonly fileNamePrefix: string,
		private readonly baseLogger?: ITelemetryBufferedLogger | undefined,
	) {}

	async flush(): Promise<void> {
		// First ensure we flush the "real" logger, before trying to write the file.
		await this.baseLogger?.flush();
		const logs = this.logs;
		if (!fs.existsSync(this.outputDirectoryPath)) {
			fs.mkdirSync(this.outputDirectoryPath, { recursive: true });
		}
		// sort from most common column to least common
		const schema = [...this.schema].sort((a, b) => b[1] - a[1]).map((v) => v[0]);
		const data = logs.reduce(
			(file, event) =>
				// eslint-disable-next-line @typescript-eslint/no-base-to-string
				`${file}\n${schema.reduce((line, k) => `${line}${event[k] ?? ""},`, "")}`,
			schema.join(","),
		);
		const filePath = `${this.outputDirectoryPath}/${this.fileNamePrefix}_${Date.now()}.csv`;
		fs.writeFileSync(filePath, data);
		this.schema.clear();
		this.logs = [];
	}
	send(event: ITelemetryBaseEvent): void {
		if (typeof event.testCategoryOverride === "string") {
			event.category = event.testCategoryOverride;
		} else if (
			typeof event.message === "string" &&
			event.message?.includes("FaultInjectionNack")
		) {
			event.category = "generic";
		}

		const plainEvent: ITelemetryBaseEvent = {
			...event,
			hostName: pkgName,
			testVersion: pkgVersion,
		};
		if (process.env.FLUID_LOGGER_PROPS !== undefined) {
			plainEvent.details = process.env.FLUID_LOGGER_PROPS;
		}
		this.baseLogger?.send(plainEvent);

		event.Event_Time = Date.now();
		// keep track of the frequency of every log event, as we'll sort by most common on write
		Object.keys(event).forEach((k) => this.schema.set(k, (this.schema.get(k) ?? 0) + 1));
		this.logs.push(event);
	}
}
