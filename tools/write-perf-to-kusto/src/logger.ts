import { ITelemetryBufferedLogger } from "@fluidframework/test-driver-definitions";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";

/**
 * Not really buffered, we just need a default implementation of the interface.
 * This one writes to the console on every send() call.
 */
export class ConsoleLogger implements ITelemetryBufferedLogger {
    public constructor() {
    }

    async flush(runInfo?: { url: string; runId?: number; }): Promise<void> {
        return;
    }

    send(event: ITelemetryBaseEvent): void {
        event.Event_Time = Date.now();
        // keep track of the frequency of every log event, as we'll sort by most common on write
        console.log(JSON.stringify(event));
    }
}
