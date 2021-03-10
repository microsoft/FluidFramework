/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryBaseEvent } from "@fluidframework/common-definitions";
import { ChildLogger, ITelemetryLoggerProperties, ITelemetryLoggerProperty, TelemetryLogger } from "../logger";

class TestTelemetryLogger  extends TelemetryLogger {
    public events: ITelemetryBaseEvent[]=[];
    public send(event: ITelemetryBaseEvent): void {
        this.events.push(this.prepareEvent(event));
    }
}

const allCases: (ITelemetryLoggerProperty)[] =
    [{}, {allProp: 1}, {allGetter: () => 1}, {allProp: 1, allGetter: () => 1}];
const errorCases: (ITelemetryLoggerProperty)[] =
    [{}, {errorProp: 2}, {errorGetter: () => 2}, {errorProp: 2, errorGetter: () => 2}];

const propertyCases: (ITelemetryLoggerProperties | undefined)[] =
    allCases.reduce<ITelemetryLoggerProperties[]>(
        (pv, all)=> {
            pv.push(... errorCases.map((error)=>({all, error})));
            return pv;
        },
        []);
propertyCases.push(...allCases.map((all)=>({all, error: all})));
propertyCases.push(...allCases);
propertyCases.push(...errorCases);
propertyCases.push(undefined);

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
                // +2 for category and event name
                assert.strictEqual(
                    eventKeys.length,
                    propsKeys.length + 2,
                    `actual:\n${JSON.stringify(event)}\nexpected:${props ? JSON.stringify(props) : "undefined"}`);
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
                // should include error props too
                const propsKeys = Object.keys({... props?.all, ... props?.error});
                // +2 for category and event name
                assert.strictEqual(
                    eventKeys.length,
                    propsKeys.length + 2,
                    `actual:\n${JSON.stringify(event)}\nexpected:${props ? JSON.stringify(props) : "undefined"}`);
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
                // +2 for category and event name
                assert.strictEqual(
                    eventKeys.length,
                    propsKeys.length + 2,
                    `actual:\n${JSON.stringify(event)}\nexpected:${props ? JSON.stringify(props) : "undefined"}`);
            }
        });

        it("childlogger send", ()=>{
            for(const props of propertyCases) {
                const logger = new TestTelemetryLogger("namespace", props);
                const childLogger = ChildLogger.create(
                    logger,
                    "child",
                    {all:{child: true}});
                childLogger.send({category: "anything", eventName: "whatever"});
                assert.strictEqual(logger.events.length, 1);
                const event = logger.events[0];
                assert.strictEqual(event.category, "anything");
                assert.strictEqual(event.eventName, "namespace:child:whatever");
                assert.strictEqual(event.child, true);

                const eventKeys = Object.keys(event);
                const propsKeys = Object.keys(props?.all ?? {});
                // +3 for child, category, and event name
                assert.strictEqual(
                    eventKeys.length,
                    propsKeys.length + 3,
                    `actual:\n${JSON.stringify(event)}\nexpected:${props ? JSON.stringify(props) : "undefined"}`);
            }
        });
    });
});
