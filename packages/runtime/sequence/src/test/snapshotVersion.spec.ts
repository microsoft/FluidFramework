/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { GitManager } from "@microsoft/fluid-server-services-client";
import * as mocks from "@microsoft/fluid-test-runtime-utils";
import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { SharedString } from "../sharedString";
import { generateStrings } from "./generateSharedStrings";

/* tslint:disable:non-literal-fs-path */

describe("SharedString Snapshot Version", () => {
    let filebase: string;
    const message = "SharedString snapshot format has changed." +
        "Please update the snapshotFormatVersion if appropriate " +
        "and then run npm test:newsnapfiles to create new snapshot test files.";

    before(() => {
        filebase = path.join(__dirname, "../../src/test/sequenceTestSnapshot");
    });

    // TODO: Remove 'newFormat' arg once new snapshot format is adopted as default.
    //       (See https://github.com/microsoft/FluidFramework/issues/84)
    function getFilename(i: number, newFormat: boolean) {
        return `${filebase}${i + 1}${newFormat ? "-new" : ""}.json`;
    }

    // TODO: Remove 'newFormat' arg once new snapshot format is adopted as default.
    //       (See https://github.com/microsoft/FluidFramework/issues/84)
    function generateSnapshotRebuildTest(testString: SharedString, i: number, newFormat: boolean) {
        it(`string ${i + 1}`, async () => {
            const filename = getFilename(i, newFormat);
            assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
            const data = fs.readFileSync(filename, "utf8");
            const oldsnap = JSON.parse(data);

            const historian: mocks.MockHistorian = new mocks.MockHistorian();
            const gitManager: GitManager = new GitManager(historian);

            await gitManager.createTree(oldsnap);

            // load snapshot into sharedString
            const documentId = "fakeId";
            const runtime = new mocks.MockRuntime();

            if (newFormat) {
                runtime.options.newMergeTreeSnapshotFormat = newFormat;
            }
            const deltaConnectionFactory = new mocks.MockDeltaConnectionFactory();

            const services = {
                // deltaConnection: new mocks.MockDeltaConnection(runtime),
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
                objectStorage: historian,
            };
            const sharedString = new SharedString(runtime, documentId);
            await sharedString.load(null/*branchId*/, services);
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
            let index = 0;
            for (const str of generateStrings(false)) {
                generateSnapshotRebuildTest(str, index, /* newFormat: */ false);
                index++;
            }
            index = 0;
            for (const str of generateStrings(true)) {
                generateSnapshotRebuildTest(str, index, /* newFormat: */ true);
                index++;
            }
        });
    }
    // tslint:disable-next-line:mocha-no-side-effect-code
    generateSnapshotRebuildTests();

    function generateSnapshotDiffTest(testString: SharedString, i: number, newFormat: boolean) {
        it(`string ${i + 1}`, async () => {
            const filename = getFilename(i, newFormat);
            assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
            const data = fs.readFileSync(filename, "utf8");
            const testData = JSON.stringify(testString.snapshot());
            if (data !== testData) {
                assert(false, `${message}\n\t${diff(data, testData)}\n\t${diff(testData, data)}`);
            }
        });
    }

    function generateSnapshotDiffTests() {
        describe("Snapshot diff", () => {
            let index = 0;
            for (const str of generateStrings(false)) {
                generateSnapshotDiffTest(str, index, /* newFormat: */ false);
                index++;
            }
            index = 0;
            for (const str of generateStrings(true)) {
                generateSnapshotDiffTest(str, index, /* newFormat: */ true);
                index++;
            }
        });
    }
    // tslint:disable-next-line:mocha-no-side-effect-code
    generateSnapshotDiffTests();

    function diff(s1: string, s2: string): string {
        let i = 0;
        while (i < s1.length && i < s2.length && s1[i] === s2[i]) {
            ++i;
        }
        return `... ${s1.slice(Math.max(i - 20, 0), Math.min(i + 200, s1.length - 1))} ...`;
    }
});
