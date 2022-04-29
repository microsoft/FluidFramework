/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { ChildLogger } from "../logger";

describe("ChildLogger", () => {
    it("Properties & Getters Propagate", () => {
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
                all: {
                    testProperty: true,
                    testGetter: () => true,
                },
            },
        );

        childLogger1.send({ category: "generic", eventName: "test1" });
        assert(sent, "event should be sent");

        sent = false;
        const childLogger2 = ChildLogger.create(
            childLogger1,
            "test2");

        childLogger2.send({ category: "generic", eventName: "test2" });
        assert(sent, "event should be sent");
    });

    it("Undefined initial Properties and Getter", () => {
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
                    testGetter: () => true,
                },
            },
        );

        childLogger2.send({ category: "generic", eventName: "testEvent" });
        assert(sent, "event should be sent");
    });

    it("Properties Are Combined", () => {
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

        childLogger2.send({ category: "generic", eventName: "testEvent" });
        assert(sent, "event should be sent");
    });

    it("Getters Are Combined", () => {
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
                    testGetter1: () => true,
                },
            },
        );

        const childLogger2 = ChildLogger.create(
            childLogger1,
            "test2",
            {
                all:
                {
                    testGetter2: () => true,
                },
            },
        );

        childLogger2.send({ category: "generic", eventName: "testEvent" });
        assert(sent, "event should be sent");
    });

    it("Undefined initial namespace", () => {
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

        childLogger2.send({ category: "generic", eventName: "testEvent" });
        assert(sent, "event should be sent");
    });

    it("Undefined second child namespace", () => {
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

        childLogger2.send({ category: "generic", eventName: "testEvent" });
        assert(sent, "event should be sent");
    });

    it("Undefined namespace", () => {
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

        childLogger2.send({ category: "generic", eventName: "testEvent" });
        assert(sent, "event should be sent");
    });
});
