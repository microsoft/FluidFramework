/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable:no-console

import * as assert from "assert";
import * as map from "..";

describe("Routerlicious", () => {
    describe("Directory", () => {
        let rootDirectory: map.ISharedDirectory;
        let testDirectory: map.ISharedDirectory;
        let extension: map.DirectoryExtension;

        beforeEach(async () => {
            extension = new map.DirectoryExtension();
            rootDirectory = extension.create(null, "root");
            testDirectory = extension.create(null, "test");
        });

        it("Can get the root directory", () => {
            assert.ok(rootDirectory);
        });

        it("Can create a new directory", () => {
            assert.ok(testDirectory);
        });

        it("Can set and get keys one level deep", () => {
            testDirectory.setPath("/testKey", "testValue");
            testDirectory.setPath("/testKey2", "testValue2");
            assert.equal(testDirectory.getPath("/testKey"), "testValue");
            assert.equal(testDirectory.getPath("/testKey2"), "testValue2");
        });

        it("Can set and get keys two levels deep", () => {
            testDirectory.setPath("/foo/testKey", "testValue");
            testDirectory.setPath("/foo/testKey2", "testValue2");
            testDirectory.setPath("/bar/testKey3", "testValue3");
            assert.equal(testDirectory.getPath("/foo/testKey"), "testValue");
            assert.equal(testDirectory.getPath("/foo/testKey2"), "testValue2");
            assert.equal(testDirectory.getPath("/bar/testKey3"), "testValue3");
        });

        it("Can get a subdirectory", () => {
            testDirectory.setPath("/foo/testKey", "testValue");
            testDirectory.setPath("/foo/testKey2", "testValue2");
            testDirectory.setPath("/bar/testKey3", "testValue3");
            const testSubdir = testDirectory.getPath("/foo");
            assert.ok(testSubdir);
        });

        it("Can get a subdirectory and get keys from that using relative paths", () => {
            testDirectory.setPath("/foo/testKey", "testValue");
            testDirectory.setPath("/foo/testKey2", "testValue2");
            testDirectory.setPath("/bar/testKey3", "testValue3");
            const testSubdir = testDirectory.getPath("/foo");
            assert.equal((testSubdir as map.SubDirectory).getPath("testKey"), "testValue");
            assert.equal((testSubdir as map.SubDirectory).getPath("./testKey2"), "testValue2");
            assert.equal((testSubdir as map.SubDirectory).getPath("./testKey3"), undefined);
        });
    });
});
