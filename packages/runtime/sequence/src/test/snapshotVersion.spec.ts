/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as mocks from "@fluidframework/test-runtime-utils";
import { GitManager } from "@fluidframework/server-services-client";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { generateStrings, LocationBase } from "./generateSharedStrings";

/* tslint:disable:non-literal-fs-path */

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

            const historian: mocks.MockHistorian = new mocks.MockHistorian();
            const gitManager: GitManager = new GitManager(historian);

            await gitManager.createTree(oldsnap);

            // load snapshot into sharedString
            const documentId = "fakeId";
            const runtime = new mocks.MockRuntime();
            const deltaConnectionFactory = new mocks.MockDeltaConnectionFactory();

            const services = {
                // deltaConnection: new mocks.MockDeltaConnection(runtime),
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),

                objectStorage: historian,
            };
            const sharedString = new SharedString(runtime, documentId, SharedStringFactory.Attributes);
            // eslint-disable-next-line no-null/no-null
            await sharedString.load(null/* branchId */, services);
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
            const data = fs.readFileSync(filename, "utf8");
            const testData = JSON.stringify(testString.snapshot(), undefined, 1);
            if (data !== testData) {
                assert(false, `${message}\n\t${diff(data, testData)}\n\t${diff(testData, data)}`);
            }
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

    function diff(s1: string, s2: string): string {
        let i = 0;
        while (i < s1.length && i < s2.length && s1[i] === s2[i]) {
            ++i;
        }
        return `... ${s1.slice(Math.max(i - 20, 0), Math.min(i + 200, s1.length - 1))} ...`;
    }
});
