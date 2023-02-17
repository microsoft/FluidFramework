/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-nodejs-modules
import crypto from "crypto";
// eslint-disable-next-line import/no-nodejs-modules
import fs from "fs";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { assert, LazyPromise } from "@fluidframework/common-utils";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { pkgName, pkgVersion } from "../../packageVersion";

const packageName = `${pkgName}@${pkgVersion}`;

class FileLogger extends TelemetryLogger implements ITelemetryBufferedLogger {
	private static readonly loggerP = new LazyPromise<FileLogger>(async () => {
		assert(process.env.FLUID_TEST_LOGGER_PKG_PATH !== undefined, "Fluid Logger not defined");
		await import(process.env.FLUID_TEST_LOGGER_PKG_PATH);
		const logger = getTestLogger?.();
		assert(logger !== undefined, "Expected getTestLogger to return something");
		return new FileLogger(logger);
	});

	public static async createLogger(dimensions: {
		driverType: string;
		driverEndpointName: string | undefined;
		profile: string | undefined;
		runId: number | undefined;
	}) {
		assert(process.env.FLUID_BUILD_ID !== undefined, "Fluid Build Id not defined");
		dimensions.runId = parseInt(process.env.FLUID_BUILD_ID, 10);

		return ChildLogger.create(await this.loggerP, undefined, {
			all: dimensions,
		});
	}

	public static async flushLogger(runInfo?: { url: string; runId?: number }) {
		await (await this.loggerP).flush(runInfo);
	}

	private error: boolean = false;
	private readonly schema = new Map<string, number>();
	private logs: ITelemetryBaseEvent[] = [];

	private constructor(private readonly baseLogger?: ITelemetryBufferedLogger) {
		super(undefined /* namespace */, { all: { testVersion: pkgVersion } });
	}

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
		this.baseLogger?.send({ ...event, hostName: pkgName });

		event.Event_Time = Date.now();
		// keep track of the frequency of every log event, as we'll sort by most common on write
		Object.keys(event).forEach((k) => this.schema.set(k, (this.schema.get(k) ?? 0) + 1));
		if (event.category === "error") {
			this.error = true;
		}
		this.logs.push(event);
	}
}

export const createLogger = FileLogger.createLogger.bind(FileLogger);
