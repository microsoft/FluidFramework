/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable max-len */

import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { ChildLogger } from "../logger";
import { MockLogger } from "../mockLogger";

describe("ChildLogger", () => {
    it.only("layerVersions", () => {
        // Arrange
        const mockLogger = new MockLogger();
        const loggerA = ChildLogger.create(mockLogger, "A", {}, {}, "0.1");
        const loggerB = ChildLogger.create(loggerA, undefined, {}, {}, "0.2");
        const loggerC = ChildLogger.create(loggerB, "C", {}, {});
        const loggerD = ChildLogger.create(loggerC, "D", {}, {}, "0.4");
        const loggerE = ChildLogger.create(loggerD, "E", {}, {}, "0.5");

        loggerE.send({ category: "generic", eventName: "test1"});
        assert(mockLogger.matchEvents([{layerVersions:"A:0.1, D:0.4, E:0.5"}]), "layerVersions not built properly");

        loggerA.send({ category: "generic", eventName: "test2"});
        assert(mockLogger.matchEvents([{layerVersions:"A:0.1, D:0.4, E:0.5"}]), "layerVersions not propagated globally properly");
    });
    it("Properties & Getters Propagate",()=>{
        let sent = false;
        const logger: ITelemetryBaseLogger = {
            send(event: ITelemetryBaseEvent): void {
                if (event.testProperty !== true || event.testGetter !== true) {
                    throw new Error("expected testProperty and testGetter on event");
                }
                sent = true;
            },
        };
        const childLogger1 = ChildLogger.create(
            logger,
            "test1",
            {
                all:{
                    testProperty: true,
                    testGetter: ()=>true,
                },
            },
        );

        childLogger1.send({ category:"generic", eventName:"test1" });
        assert(sent, "event should be sent");

        sent = false;
        const childLogger2 = ChildLogger.create(
            childLogger1,
            "test2");

        childLogger2.send({ category:"generic", eventName:"test2" });
        assert(sent, "event should be sent");
    });

    it("Undefined initial Properties and Getter",()=>{
        let sent = false;
        const logger: ITelemetryBaseLogger = {
            send(event: ITelemetryBaseEvent): void {
                if (event.testProperty !== true || event.testGetter !== true) {
                    throw new Error("expected testProperty and testGetter on event");
                }
                if (event.eventName !== "test1:test2:testEvent") {
                    throw new Error("expected combined namespace");
                }
                sent = true;
            },
        };
        const childLogger1 = ChildLogger.create(
            logger,
            "test1");

        sent = false;
        const childLogger2 = ChildLogger.create(
            childLogger1,
            "test2",
            {
                all:
                {
                    testProperty: true,
                    testGetter: ()=>true,
                },
            },
        );

        childLogger2.send({ category:"generic", eventName:"testEvent" });
        assert(sent, "event should be sent");
    });

    it("Properties Are Combined",()=>{
        let sent = false;
        const logger: ITelemetryBaseLogger = {
            send(event: ITelemetryBaseEvent): void {
                if (event.testProperty1 !== true || event.testProperty2 !== true) {
                    throw new Error("expected testProperty1 and testProperty2 on event");
                }
                if (event.eventName !== "test1:test2:testEvent") {
                    throw new Error("expected combined namespace");
                }
                sent = true;
            },
        };
        const childLogger1 = ChildLogger.create(
            logger,
            "test1",
            {
                all:
                {
                    testProperty1: true,
                },
            },
        );

        const childLogger2 = ChildLogger.create(
            childLogger1,
            "test2",
            {
                all:
                {
                    testProperty2: true,
                },
            });

        childLogger2.send({ category:"generic", eventName:"testEvent" });
        assert(sent, "event should be sent");
    });

    it("Getters Are Combined",()=>{
        let sent = false;
        const logger: ITelemetryBaseLogger = {
            send(event: ITelemetryBaseEvent): void {
                if (event.testGetter1 !== true || event.testGetter2 !== true) {
                    throw new Error("expected testGetter1 and testGetter2 on event");
                }
                if (event.eventName !== "test1:test2:testEvent") {
                    throw new Error("expected combined namespace");
                }
                sent = true;
            },
        };
        const childLogger1 = ChildLogger.create(
            logger,
            "test1",
            {
                all:
                {
                    testGetter1: ()=> true,
                },
            },
        );

        const childLogger2 = ChildLogger.create(
            childLogger1,
            "test2",
            {
                all:
                {
                    testGetter2: ()=> true,
                },
            },
        );

        childLogger2.send({ category:"generic", eventName:"testEvent" });
        assert(sent, "event should be sent");
    });

    it("Undefined initial namespace",()=>{
        let sent = false;
        const logger: ITelemetryBaseLogger = {
            send(event: ITelemetryBaseEvent): void {
                if (event.eventName !== "test2:testEvent") {
                    throw new Error("expected combined namespace");
                }
                sent = true;
            },
        };
        const childLogger1 = ChildLogger.create(
            logger);

        sent = false;
        const childLogger2 = ChildLogger.create(
            childLogger1,
            "test2");

        childLogger2.send({ category:"generic", eventName:"testEvent" });
        assert(sent, "event should be sent");
    });

    it("Undefined second child namespace",()=>{
        let sent = false;
        const logger: ITelemetryBaseLogger = {
            send(event: ITelemetryBaseEvent): void {
                if (event.eventName !== "test1:testEvent") {
                    throw new Error("expected combined namespace");
                }
                sent = true;
            },
        };
        const childLogger1 = ChildLogger.create(
            logger,
            "test1");

        sent = false;
        const childLogger2 = ChildLogger.create(
            childLogger1);

        childLogger2.send({ category:"generic", eventName:"testEvent" });
        assert(sent, "event should be sent");
    });

    it("Undefined namespace",()=>{
        let sent = false;
        const logger: ITelemetryBaseLogger = {
            send(event: ITelemetryBaseEvent): void {
                if (event.eventName !== "testEvent") {
                    throw new Error("expected combined namespace");
                }
                sent = true;
            },
        };
        const childLogger1 = ChildLogger.create(
            logger);

        sent = false;
        const childLogger2 = ChildLogger.create(
            childLogger1);

        childLogger2.send({ category:"generic", eventName:"testEvent" });
        assert(sent, "event should be sent");
    });
});
