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
    MultiSinkLogger,
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
const exampleMysteryEvent: ITelemetryGenericEvent = {
    category:"generic",
    eventName:"testEvent",
    mysteryProperty: exampleTaggedTelemetryPropertyWithMysteryTag,
};
const exampleMysteryError = {
    mysteryProperty2: exampleTaggedTelemetryPropertyWithMysteryTag,
};
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

describe("ChildLogger tag propagation", () => {
    let sent = false;
    // In this minimal base logger, no assumption about supportsTags is made as we are just trying to check what gets
    // filtered up by the two child loggers:
    const logger: ITelemetryBaseLogger = {
        send(event: ITelemetryBaseEvent): void {
            // if (event.testGetter2 === true && event.mysteryProperty !== true) {
            //     throw new Error("expected childLogger2 to pass tagged object");
            // }
            if (event.testGetter1 === true && event.mysteryProperty !== "REDACTED (unknown tag)") {
                throw new Error("expected mystery property to be redacted by cl1");
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
        undefined,
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
        true,
    );

    childLogger2.sendTelemetryEvent(exampleMysteryEvent, new LoggingError("foo", exampleMysteryError));
    assert(sent, "event should be sent");
});

describe("MultiSinkLogger tagging", () => {
    let sent = false;
    let count = 0;
    const multiSinkLogger: MultiSinkLogger = new MultiSinkLogger("multiSinkTest");
    const baseLogger: ITelemetryBaseLogger = {
        send(event: ITelemetryBaseEvent): void {
            count += 1;
            if (event.testGetterTT && event.mysteryProperty !== "mysteryValue") {
                throw new Error("expected clsTT to carry through tagged prop");
            }
            else if (event.testGetterTF && event.userProperty !== "REDACTED (unknown tag)") {
                throw new Error("expected clsTF to redact tagged prop");
            }
            else if (event.testGetterTU && event.mysteryProperty !== "REDACTED (unknown tag)") {
                throw new Error("expected clsTU to redact tagged prop");
            }
            if (count === 3) {
                sent = true;
            }
        },
    };
    const childLoggerSupportsTagsTrue = ChildLogger.create(
        baseLogger,
        "clSupportsTagsTrue",
        {
            all:
            {
                testGetterTT: ()=> true,
            },
        },
    );
    const childLoggerSupportsTagsFalse = ChildLogger.create(
        baseLogger,
        "clSupportsTagsFalse",
        {
            all:
            {
                testGetterTF: ()=> true,
            },
        },
    );
    const childLoggerSupportsTagsUndefined = ChildLogger.create(
        baseLogger,
        "clSupportsTagsUndefined",
        {
            all:
            {
                testGetterTU: ()=> true,
            },
        },
    );
    multiSinkLogger.addLogger(childLoggerSupportsTagsTrue);
    multiSinkLogger.addLogger(childLoggerSupportsTagsFalse);
    multiSinkLogger.addLogger(childLoggerSupportsTagsUndefined);
    // multiSinkLogger.send(exampleMysteryEvent);

    // childLoggerSupportsTagsTrue.send(exampleMysteryEvent);
    assert(sent, "event should be sent");
});
