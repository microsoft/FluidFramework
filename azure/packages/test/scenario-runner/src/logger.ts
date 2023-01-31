/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import crypto from "crypto";
import fs from "fs";

import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { LazyPromise, assert } from "@fluidframework/common-utils";
import { ChildLogger, TelemetryLogger } from "@fluidframework/telemetry-utils";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

import { pkgName, pkgVersion } from "./packageVersion";

export interface LoggerConfig {
	scenarioName?: string;
	namespace?: string;
	runId?: string;
	endpoint?: string;
}

class ScenarioRunnerLogger extends TelemetryLogger implements ITelemetryBufferedLogger {
	private error: boolean = false;
	private readonly schema = new Map<string, number>();
	private targetEvents: string[] = [];
	private transformedEvents: Map<string, string> = new Map();
	private logs: ITelemetryBaseEvent[] = [];

	public constructor(private readonly baseLogger?: ITelemetryBufferedLogger) {
		super(undefined /* namespace */, { all: { testVersion: pkgVersion } });
	}

	public registerExpectedEvent(expectedEventNames: string[]) {
		this.targetEvents = expectedEventNames;
	}

	public transformEvents(events: Map<string, string>) {
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
		// We want to log only events that are relevant to the test runner.
		if (this.targetEvents.length > 0) {
			const found = this.targetEvents.find((a) => event.eventName.startsWith(a));
			if (!found) {
				return;
			}
		}

		// Here we are remapping internal FF events to scenario runner events.
		// TODO: Further cleanup needed.
		for (const k of this.transformedEvents.keys()) {
			if (event.eventName.startsWith(k)) {
				event.eventName = `${this.transformedEvents.get(k)}${event.eventName.slice(
					k.length,
				)}`;
				break;
			}
		}

		if (typeof event.testCategoryOverride === "string") {
			event.category = event.testCategoryOverride;
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

function getRegionFromEndpointUrl(endpointUrl: string): string | undefined {
	const definedRegions = ["westus2", "westus3", "eastus", "europe"];

	for (const region of definedRegions) {
		if (endpointUrl.includes(region)) {
			return region;
		}
	}

	return undefined;
}

export async function getLogger(
	config: LoggerConfig,
	events?: string[],
	transformEvents?: Map<string, string>,
): Promise<TelemetryLogger> {
	const baseLogger = await loggerP;
	if (events) {
		baseLogger.registerExpectedEvent(events);
	}
	if (transformEvents) {
		baseLogger.transformEvents(transformEvents);
	}
	return ChildLogger.create(baseLogger, config.namespace, {
		all: {
			runId: config.runId,
			scenarioName: config.scenarioName,
			endpoint: config.endpoint && getRegionFromEndpointUrl(config.endpoint), // parse URL to only contain the region
		},
	});
}
