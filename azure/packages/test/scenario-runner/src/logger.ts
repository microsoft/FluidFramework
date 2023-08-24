/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import crypto from "crypto";
import fs from "fs";

import { TypedEventEmitter, assert } from "@fluidframework/common-utils";
import { IEvent, ITelemetryBaseEvent, ITelemetryLogger } from "@fluidframework/core-interfaces";
import { LazyPromise } from "@fluidframework/core-utils";
import { createChildLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

import { pkgName, pkgVersion } from "./packageVersion";
import { ScenarioRunnerTelemetryEventNames, getAzureClientConnectionConfigFromEnv } from "./utils";

export interface LoggerConfig {
	scenarioName?: string;
	namespace?: string;
	runId?: string;
}

export interface IScenarioRunnerTelemetryEvents extends IEvent {
	(
		event: ScenarioRunnerTelemetryEventNames,
		listener: (e: ITelemetryBaseEvent & { originalEventName: string }) => void,
	): void;
}

class ScenarioRunnerLogger implements ITelemetryBufferedLogger {
	private error: boolean = false;
	private readonly schema = new Map<string, number>();
	private targetEvents: string[] = [];
	private transformedEvents: Map<ScenarioRunnerTelemetryEventNames, string> = new Map();
	private logs: ITelemetryBaseEvent[] = [];
	public readonly events = new TypedEventEmitter<IScenarioRunnerTelemetryEvents>();

	public constructor(private readonly baseLogger?: ITelemetryBufferedLogger) {}

	public registerExpectedEvent(expectedEventNames: string[]) {
		this.targetEvents = expectedEventNames;
	}

	public transformEvents(events: Map<ScenarioRunnerTelemetryEventNames, string>) {
		this.transformedEvents = events;
		for (const k of events.keys()) {
			this.targetEvents.push(k);
		}
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
		if (process.env.FLUID_TEST_VERBOSE === "1") {
			if (event.category.toLowerCase() === "error") {
				console.error(event);
			} else {
				console.log(event);
			}
		}

		// We want to log only events that are relevant to the test runner.
		if (this.targetEvents.length > 0) {
			const found = this.targetEvents.find((a) => event.eventName.startsWith(a));
			if (!found) {
				return;
			}
		}

		// Here we are remapping internal FF events to scenario runner events.
		// TODO: Further cleanup needed.
		const originalEventName = event.eventName;
		let telemetryEventName: ScenarioRunnerTelemetryEventNames | undefined;
		for (const k of this.transformedEvents.keys()) {
			if (event.eventName.includes(k)) {
				telemetryEventName = k;
			}
			if (event.eventName.startsWith(k)) {
				event.eventName = `${this.transformedEvents.get(k)}${event.eventName.slice(
					k.length,
				)}`;
				break;
			}
		}

		// We want to emit any events that match ScenarioRunnerTelemetryEventNames
		if (telemetryEventName !== undefined) {
			this.events.emit(telemetryEventName, { ...event, originalEventName });
		}

		if (typeof event.testCategoryOverride === "string") {
			event.category = event.testCategoryOverride;
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

export const loggerP = new LazyPromise<ScenarioRunnerLogger>(async () => {
	if (process.env.FLUID_TEST_LOGGER_PKG_PATH !== undefined) {
		await import(process.env.FLUID_TEST_LOGGER_PKG_PATH);
		const logger = getTestLogger?.();
		assert(logger !== undefined, "Expected getTestLogger to return something");
		return new ScenarioRunnerLogger(logger);
	} else {
		return new ScenarioRunnerLogger();
	}
});

export async function getLogger(
	config: LoggerConfig,
	events?: string[],
	transformEvents?: Map<ScenarioRunnerTelemetryEventNames, string>,
): Promise<ITelemetryLogger> {
	const baseLogger = await loggerP;
	if (events) {
		baseLogger.registerExpectedEvent(events);
	}
	if (transformEvents) {
		baseLogger.transformEvents(transformEvents);
	}
	const connectionConfig = getAzureClientConnectionConfigFromEnv();
	return createChildLogger({
		logger: baseLogger,
		namespace: config.namespace,
		properties: {
			all: {
				runId: config.runId,
				scenarioName: config.scenarioName,
				endpoint: connectionConfig.endpoint,
				region: connectionConfig.region,
			},
		},
	});
}
