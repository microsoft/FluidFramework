/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent } from "@fluidframework/core-interfaces";
import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";

/**
 * Not really buffered, we just need a default implementation of the interface.
 * This one writes to the console on every send() call.
 */
export class ConsoleLogger implements ITelemetryBufferedLogger {
	public constructor() {}

	async flush(): Promise<void> {
		return;
	}

	send(event: ITelemetryBaseEvent): void {
		event.Event_Time = Date.now();
		console.log(JSON.stringify(event));
	}
}
