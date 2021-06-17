/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ITelemetryBaseEvent,
    ITelemetryBaseLogger,
    ITaggedTelemetryPropertyType,
    // ILoggingError,
    ITelemetryGenericEvent,
} from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import {
    // TelemetryLogger,
    ChildLogger,
    // MultiSinkLogger,
    TelemetryDataTag,
    LoggingError,
} from "../logger";

const exampleTaggedTelemetryPropertyWithUserData: ITaggedTelemetryPropertyType = {
    value: "password",
    tag: TelemetryDataTag.UserData,
};
const exampleTelemetryEvent: ITelemetryGenericEvent = {
    category:"generic",
    eventName:"testEvent",
};
// const exampleTelemetryErrorEvent: ITelemetryBaseEvent = {
//     category:"generic",
//     eventName:"exampleErrorEvent",
//     exampleTaggedTelemetryPropertyWithUserData,
// };

describe("sendTelemetryEvent() properly blocks tags", () => {
    let sent = false;
    const logger: ITelemetryBaseLogger = {
        send(event: ITelemetryBaseEvent): void {
            if (event.testGetter !== true || event.testGetter2 !== true) {
                throw new Error("expected testGetter1 and testGetter2 on event");
            }
            if (event.eventName !== "test:testEvent") {
                throw new Error("expected combined namespace");
            }
            if (event.loggingError !== "REDACTED (UserData)") {
                throw new Error("expected user data redaction");
            }
            sent = true;
        },
    };
    const childLogger = ChildLogger.create(
        logger,
        "test",
        {
            all:
            {
                testGetter: ()=> true,
            },
        },
    );
    childLogger.sendTelemetryEvent(
        exampleTelemetryEvent,
        new LoggingError("loggingError", { exampleTaggedTelemetryPropertyWithUserData }),
    );
    assert(sent, "event should be sent");
});

// describe("ChildLogger tag propagation", () => {
//     it("Getters Are Combined",()=>{
//         let sent = false;
//         const logger: ITelemetryBaseLogger = {
//             send(event: ITelemetryBaseEvent): void {
//                 if (event.testGetter1 !== true || event.testGetter2 !== true) {
//                     throw new Error("expected testGetter1 and testGetter2 on event");
//                 }
//                 if (event.eventName !== "test1:test2:testEvent") {
//                     throw new Error("expected combined namespace");
//                 }
//                 sent = true;
//             },
//         };
//         const childLogger1 = ChildLogger.create(
//             logger,
//             "test1",
//             {
//                 all:
//                 {
//                     testGetter1: ()=> true,
//                 },
//             },
//         );

//         const childLogger2 = ChildLogger.create(
//             childLogger1,
//             "test2",
//             {
//                 all:
//                 {
//                     testGetter2: ()=> true,
//                 },
//             },
//         );

//         childLogger2.send({ category:"generic", eventName:"testEvent" });
//         assert(sent, "event should be sent");
//     });

//     it("Undefined second child namespace",()=>{
//         let sent = false;
//         const logger: ITelemetryBaseLogger = {
//             send(event: ITelemetryBaseEvent): void {
//                 if (event.eventName !== "test1:testEvent") {
//                     throw new Error("expected combined namespace");
//                 }
//                 sent = true;
//             },
//         };
//         const childLogger1 = ChildLogger.create(
//             logger,
//             "test1");

//         sent = false;
//         const childLogger2 = ChildLogger.create(
//             childLogger1);

//         childLogger2.send({ category:"generic", eventName:"testEvent" });
//         assert(sent, "event should be sent");
//     });
// });

// describe("MultiSinkLogger tagging", () => {

// });
