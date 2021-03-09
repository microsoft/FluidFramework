/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ITelemetryLoggerProperties, TelemetryLogger } from "../logger";

class TestTelemetryLogger  extends TelemetryLogger {
    public events: ITelemetryBaseEvent[]=[];
    public send(event: ITelemetryBaseEvent): void {
        this.events.push(this.prepareEvent(event));
    }
}

const propertyCases: (ITelemetryLoggerProperties | undefined)[] = [
    undefined,
    {},
    {all: {}},
    {error: {}},
    {all:{}, error: {}},
    {all:{ test1: 1}, error: {}},
    {all:{ test1: 1}, error: {test2: 2}},
    {all:{ test1: ()=> 1}, error: {test2: 2}},
    {all:{ test1:  1}, error: {test2: ()=> 2}},

];

describe("TelemetryLogger", () => {
    describe("Properties", ()=>{
        it("send", ()=>{
            for(const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                logger.send({category: "anything", eventName: "whatever"});
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "anything");
                assert.strictEqual(event.eventName, "namespace:whatever");
                const eventKeys = Object.keys(event);
                const propsKeys = Object.keys(props?.all ?? {});
                assert.strictEqual(eventKeys.length, propsKeys.length + 2,JSON.stringify(event));
            }
        });

        it("sendErrorEvent",()=>{
            for(const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                logger.sendErrorEvent({eventName: "whatever"});
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "error");
                assert.strictEqual(event.eventName, "namespace:whatever");
                const eventKeys = Object.keys(event);
                const propsKeys = Object.keys({... props?.all, ... props?.error});
                assert.strictEqual(eventKeys.length, propsKeys.length + 2,JSON.stringify(event));
            }
        });

        it("sendTelemetryEvent",()=>{
            for(const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                logger.sendTelemetryEvent({eventName: "whatever"});
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "generic");
                assert.strictEqual(event.eventName, "namespace:whatever");
                const eventKeys = Object.keys(event);
                const propsKeys = Object.keys(props?.all ?? {});
                assert.strictEqual(eventKeys.length, propsKeys.length + 2,JSON.stringify(event));
            }
        });
    });
});
