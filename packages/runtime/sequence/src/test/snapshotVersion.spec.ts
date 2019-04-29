import { GitManager } from "@prague/services-client";
import * as assert from "assert";
import * as fs from "fs";
import { SharedString } from "../sharedString";
import { generateStrings } from "./generateSharedStrings";
import * as mocks from "./mocks";
/* tslint:disable:non-literal-fs-path */

describe("SharedString Snapshot Version", () => {
    const filebase: string = "src/test/sequenceTestSnapshot";

    it("snapshot rebuild", async () => {
        const message = "SharedString snapshot format has changed." +
        "Please update the snapshotFormatVersion if appropriate " +
        "and then run npm test:newsnapfiles to create new snapshot test files.";

        let i = 0;
        for (const testString of generateStrings()) {
            const filename = `${filebase}${i + 1}.json`;
            assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
            const data = fs.readFileSync(filename, "utf8");
            const oldsnap = JSON.parse(data);

            const historian: mocks.MockHistorian = new mocks.MockHistorian();
            const gitManager: GitManager = new GitManager(historian);

            await gitManager.createTree(oldsnap);

            // load snapshot into sharedString
            const documentId = "fakeId";
            const runtime: mocks.MockRuntime = new mocks.MockRuntime();
            const deltaConnectionFactory: mocks.MockDeltaConnectionFactory = new mocks.MockDeltaConnectionFactory();

            const services = {
                // deltaConnection: new mocks.MockDeltaConnection(runtime),
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),

                objectStorage: historian,
            };
            const sharedString = new SharedString(runtime, documentId, services);
            await sharedString.load(0, null/*headerOrigin*/, services);
            await sharedString.loaded;

            // test rebuilt sharedString
            assert(sharedString.getLength() === testString.getLength(), message);
            assert(sharedString.getText() === testString.getText(), message);

            for (let j = 0; j < sharedString.getLength(); j += 10) {
                assert(JSON.stringify(sharedString.getPropertiesAtPosition(j)) ===
                    JSON.stringify(testString.getPropertiesAtPosition(j)), message);
            }

            for (let j = 0; j < sharedString.getLength(); j += 50) {
                sharedString.insertText("NEWTEXT", j);
                testString.insertText("NEWTEXT", j);
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

            ++i;
        }
    });

    it("snapshot diff", async () => {
        const message = "SharedString snapshot format has changed." +
        "Please update the snapshotFormatVersion if appropriate " +
        "and then run npm test:newsnapfiles to create new snapshot test files.";

        let i = 0;
        for (const testString of generateStrings()) {
            const filename = `${filebase}${i + 1}.json`;
            assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
            const data = fs.readFileSync(filename, "utf8");
            assert(data === JSON.stringify(testString.snapshot()), message);
            ++i;
        }
    });
});
