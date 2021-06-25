/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumber } from "../lumber";
import { Lumberjack } from "../lumberjack";
import { ITelemetryMetadata, ILumberjackEngine } from "../resources";

// TestLumberjack allows us to run unit tests on Lumberjack by
// adding the reset() method
export class TestLumberjack extends Lumberjack {
    public static reset() {
        Lumberjack._instance = undefined;
    }
}

export const sampleTelemetryMetadata: ITelemetryMetadata = {
    documentId: "documentId",
    tenantId: "tenantId",
    clientId: "clientId",
    clientSequenceNumber: 0,
    sequenceNumber: 1,
};

export class TestEngine1 implements ILumberjackEngine {
    public emit(lumber: Lumber) {
    }
}

export class TestEngine2 implements ILumberjackEngine {
    public emit(lumber: Lumber) {
    }
}
