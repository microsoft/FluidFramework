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
const exampleTaggedTelemetryPropertyWithPackageData: ITaggedTelemetryPropertyType = {
    value: "packageWithSomeCoolData",
    tag: TelemetryDataTag.PackageData,
};
const exampleTaggedTelemetryPropertyWithMysteryTag: ITaggedTelemetryPropertyType = {
    value: "mysteryValue",
    tag: "MysteryTag",
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

describe("sendTelemetryEvent() properly handles sensitive data", () => {
    let sent = false;
    let count = 0;
    const logger: ITelemetryBaseLogger = {
        send(event: ITelemetryBaseEvent): void {
            if (count === 0 && event.untagged !== "untagged") {
                throw new Error("expected untagged property to be added");
            }
            else if (count === 1 && event.packageProperty !== "packageWithSomeCoolData") {
                throw new Error("PackageData not handled properly");
            }
            else if (count === 2 && event.userProperty !== "REDACTED (UserData)") {
                throw new Error("expected user data redaction");
            }
            else if (count === 3 && event.mysteryProperty !== "REDACTED (unknown tag)") {
                throw new Error("expected unrecognized tag to be redacted");
            }
            count += 1;
            if (count === 3) {
                sent = true;
            }
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
        new LoggingError("untaggedLoggingError", { untagged : "untagged" }),
    );
    childLogger.sendTelemetryEvent(
        exampleTelemetryEvent,
        new LoggingError("packageDataLoggingError",
            { packageProperty : exampleTaggedTelemetryPropertyWithPackageData }),
    );
    childLogger.sendTelemetryEvent(
        exampleTelemetryEvent,
        new LoggingError("userDataLoggingError",
            { userProperty : exampleTaggedTelemetryPropertyWithUserData }),
    );
    childLogger.sendTelemetryEvent(
        exampleTelemetryEvent,
        new LoggingError("mysteryTagLoggingError",
            { mysteryProperty : exampleTaggedTelemetryPropertyWithMysteryTag }),
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
