/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import fs from "fs";
import path from "path";
import { convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import {
    MockContainerRuntimeFactory,
    MockFluidDataStoreRuntime,
    MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { generateStrings, LocationBase } from "./generateSharedStrings";

describe("SharedString Snapshot Version", () => {
    let filebase: string;
    const message = "SharedString snapshot format has changed." +
        "Please update the snapshotFormatVersion if appropriate " +
        "and then run npm test:newsnapfiles to create new snapshot test files.";

    before(() => {
        filebase = path.join(__dirname, `../../${LocationBase}`);
    });

    function generateSnapshotRebuildTest(name: string, testString: SharedString) {
        it(name, async () => {
            const filename = `${filebase}${name}.json`;
            assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
            const data = fs.readFileSync(filename, "utf8");
            const oldsnap = JSON.parse(data);

            // load snapshot into sharedString
            const documentId = "fakeId";
            const containerRuntimeFactory = new MockContainerRuntimeFactory();
            const dataStoreRuntime = new MockFluidDataStoreRuntime();
            const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
            const services = {
                deltaConnection: containerRuntime.createDeltaConnection(),
                objectStorage: new MockStorage(oldsnap),
            };
            const sharedString = new SharedString(dataStoreRuntime, documentId, SharedStringFactory.Attributes);
            await sharedString.load(services);
            await sharedString.loaded;

            // test rebuilt sharedString
            assert(sharedString.getLength() === testString.getLength(), message);
            assert(sharedString.getText() === testString.getText(), message);

            for (let j = 0; j < sharedString.getLength(); j += 10) {
                assert(JSON.stringify(sharedString.getPropertiesAtPosition(j)) ===
                    JSON.stringify(testString.getPropertiesAtPosition(j)), message);
            }

            for (let j = 0; j < sharedString.getLength(); j += 50) {
                sharedString.insertText(j, "NEWTEXT");
                testString.insertText(j, "NEWTEXT");
            }

            assert(sharedString.getLength() === testString.getLength(), message);
            assert(sharedString.getText() === testString.getText(), message);

            sharedString.replaceText(0, sharedString.getLength(), "hello world");
            testString.replaceText(0, testString.getLength(), "hello world");
            assert(sharedString.getLength() === testString.getLength(), message);
            assert(sharedString.getText() === testString.getText(), message);

            sharedString.removeText(0, sharedString.getLength());
            testString.removeText(0, testString.getLength());
            assert(sharedString.getLength() === testString.getLength(), message);
            assert(sharedString.getText() === testString.getText(), message);
        });
    }
    function generateSnapshotRebuildTests() {
        describe("Snapshot rebuild", () => {
            for (const str of generateStrings()) {
                generateSnapshotRebuildTest(str[0], str[1]);
            }
        });
    }
    generateSnapshotRebuildTests();

    function generateSnapshotDiffTest(name: string, testString: SharedString) {
        it(name, async () => {
            const filename = `${filebase}${name}.json`;
            assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
            const data = fs.readFileSync(filename, "utf8").trim();
            const dataObject = JSON.parse(data);

            const summaryTree = testString.summarize().summary;
            const snapshotTree = convertSummaryTreeToITree(summaryTree);
            const testData = JSON.stringify(snapshotTree, undefined, 1).trim();
            const testDataObject = JSON.parse(testData);

            assert.deepStrictEqual(dataObject, testDataObject, message);
        });
    }

    function generateSnapshotDiffTests() {
        describe("Snapshot diff", () => {
            for (const str of generateStrings()) {
                generateSnapshotDiffTest(str[0], str[1]);
            }
        });
    }
    generateSnapshotDiffTests();
});
