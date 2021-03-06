import assert from "assert";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ITelemetryLoggerProperties, TelemetryLogger } from "../logger";

class TestTelemetryLogger  extends TelemetryLogger {
    public events: ITelemetryBaseEvent[]=[];
    public send(event: ITelemetryBaseEvent): void {
        this.events.push(this.prepareEvent(event));
    }
}

const emptyPropertyCases: ITelemetryLoggerProperties[] = [
    {},
    {all: {}},
    {error: {}},
];

describe("TelemetryLogger", () => {
    it("send with empty logger properties",()=>{
        for(const props of emptyPropertyCases) {
            const logger = new TestTelemetryLogger("namespace", props);
            logger.send({category: "anything", eventName: "whatever"});
            assert.strictEqual(logger.events.length, 1);
            const event = logger.events[0];
            assert.strictEqual(event.category, "anything");
            assert.strictEqual(event.eventName, "namespace:whatever");
            const key = Object.keys(event);
            assert.strictEqual(key.length, 2,JSON.stringify(event));
        }
    });

    it("sendError with empty logger properties",()=>{
        for(const props of emptyPropertyCases) {
            const logger = new TestTelemetryLogger("namespace", props);
            logger.sendErrorEvent({eventName: "whatever"});
            assert.strictEqual(logger.events.length, 1);
            const event = logger.events[0];
            assert.strictEqual(event.category, "error");
            assert.strictEqual(event.eventName, "namespace:whatever");
            const key = Object.keys(event);
            assert.strictEqual(key.length, 2,JSON.stringify(event));
        }
    });

    it("sendTelemetryEvent with empty logger properties",()=>{
        for(const props of emptyPropertyCases) {
            const logger = new TestTelemetryLogger("namespace", props);
            logger.sendTelemetryEvent({eventName: "whatever"});
            assert.strictEqual(logger.events.length, 1);
            const event = logger.events[0];
            assert.strictEqual(event.category, "generic");
            assert.strictEqual(event.eventName, "namespace:whatever");
            const key = Object.keys(event);
            assert.strictEqual(key.length, 2,JSON.stringify(event));
        }
    });
});
