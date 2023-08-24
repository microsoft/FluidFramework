/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedCounter } from "@fluidframework/counter";
import {
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	TinyliciousClient,
} from "@fluidframework/tinylicious-client";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";

const schema = {
	initialObjects: { counter: SharedCounter },
};

class TestLogger implements ITelemetryBaseLogger {
	public events: ITelemetryBaseEvent[] = [];
	public send(event: ITelemetryBaseEvent): void {
		this.events.push(event);
	}

	public clear(): void {
		this.events = [];
	}
}

const configProvider: IConfigProviderBase = {
	getRawConfig: (name: string): ConfigTypes =>
		name === "Fluid.Telemetry.DisableSampling" ? true : undefined,
};
const logger = new TestLogger();

const client = new TinyliciousClient({ logger: logger, configProvider });

const opCounts = [100, 500, 1_000, 2_000, 5_000];
// const opCounts = [100, 200, 300, 400, 500, 600, 700, 800];

async function run() {
	for (const opCount of opCounts) {
		// let numOfOpsSeen: number = 0;
		const { container } = await client.createContainer(schema);
		await container.attach();

		const counter = container.initialObjects.counter as SharedCounter;

		// let { deltaManager } = container as unknown as any;
		// if (!("clientSequenceNumber" in deltaManager)) {
		// 	deltaManager = deltaManager.connectionManager;
		// }

		const prom = new Promise<void>((resolve) => {
			// counter.on("incremented", (incrementAmount: number) => {
			// 	numOfOpsSeen++;
			// 	if (numOfOpsSeen === opCount) {
			// 		resolve();
			// 	}
			// });

			// deltaManager.inbound.on("push", () => {
			// 	numOfOpsSeen++;
			// 	if (numOfOpsSeen === opCount) {
			// 		resolve();
			// 	}
			// });
			container.on("saved", () => {
				resolve();
			});
		});

		const startTime = performance.now();
		for (let i = 0; i < opCount; i++) {
			counter.increment(1);
		}

		await prom;

		// Wait for all ops to roundtrip
		// const minSeqNum = deltaManager.minimumSequenceNumber;
		// const maxSeqNum = deltaManager.lastSequenceNumber;

		// const isContainerDirty = deltaManager.readOnlyInfo.readonly !== true && isDirty;

		const endTime = performance.now();

		console.log(
			`Test for ${opCount.toString().padStart(4, " ")} ops : ${endTime - startTime}ms`,
		);

		const numOfOpRoundtripTimeEvents = logger.events.filter((x) =>
			x.eventName.endsWith("OpRoundtripTime"),
		).length;
		console.log(`  ${numOfOpRoundtripTimeEvents} OpRoundtripTime events`);
		logger.clear();
	}

	process.exit(0);
}

run().catch(console.error);
