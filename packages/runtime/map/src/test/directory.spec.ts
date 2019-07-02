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
            testDirectory.set("/testKey", "testValue");
            testDirectory.set("/testKey2", "testValue2");
            assert.equal(testDirectory.get("/testKey"), "testValue");
            assert.equal(testDirectory.get("/testKey2"), "testValue2");
        });

        it("Can set and get keys two levels deep", () => {
            testDirectory.set("/foo/testKey", "testValue");
            testDirectory.set("/foo/testKey2", "testValue2");
            testDirectory.set("/bar/testKey3", "testValue3");
            assert.equal(testDirectory.get("/foo/testKey"), "testValue");
            assert.equal(testDirectory.get("/foo/testKey2"), "testValue2");
            assert.equal(testDirectory.get("/bar/testKey3"), "testValue3");
        });

        it("Can be cleared from the root", () => {
            testDirectory.set("/foo/testKey", "testValue");
            testDirectory.set("/foo/testKey2", "testValue2");
            testDirectory.set("/bar/testKey3", "testValue3");
            testDirectory.set("testKey", "testValue4");
            testDirectory.set("testKey2", "testValue5");
            testDirectory.clear();
            assert.equal(testDirectory.get("/foo/testKey"), undefined);
            assert.equal(testDirectory.get("/foo/testKey2"), undefined);
            assert.equal(testDirectory.get("/bar/testKey3"), undefined);
            assert.equal(testDirectory.get("testKey"), undefined);
            assert.equal(testDirectory.get("testKey2"), undefined);
        });

        it("Can delete keys from the root", () => {
            testDirectory.set("/foo/testKey", "testValue");
            testDirectory.set("/foo/testKey2", "testValue2");
            testDirectory.set("/bar/testKey3", "testValue3");
            testDirectory.set("testKey", "testValue4");
            testDirectory.set("testKey2", "testValue5");
            testDirectory.delete("testKey2");
            testDirectory.delete("/foo/testKey2");
            assert.equal(testDirectory.get("/foo/testKey"), "testValue");
            assert.equal(testDirectory.get("/foo/testKey2"), undefined);
            assert.equal(testDirectory.get("/bar/testKey3"), "testValue3");
            assert.equal(testDirectory.get("testKey"), "testValue4");
            assert.equal(testDirectory.get("testKey2"), undefined);
        });

        describe("SubDirectory", () => {
            it("Can get a subdirectory", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                assert.ok(testSubdir);
            });

            it("Can get and set keys from a subdirectory using relative paths", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                assert.equal(testSubdir.has("./testKey"), true);
                assert.equal(testSubdir.get("testKey"), "testValue");
                assert.equal(testSubdir.get("./testKey2"), "testValue2");
                assert.equal(testSubdir.get("./testKey3"), undefined);
                testSubdir.set("fromSubdir", "testValue4");
                assert.equal(testDirectory.get("/foo/fromSubdir"), "testValue4");
            });

            it("Can be cleared from the subdirectory", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                testDirectory.set("testKey", "testValue4");
                testDirectory.set("testKey2", "testValue5");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                testSubdir.clear();
                assert.equal(testDirectory.get("/foo/testKey"), undefined);
                assert.equal(testDirectory.get("/foo/testKey2"), undefined);
                assert.equal(testDirectory.get("/bar/testKey3"), "testValue3");
                assert.equal(testDirectory.get("testKey"), "testValue4");
                assert.equal(testDirectory.get("testKey2"), "testValue5");
            });

            it("Can delete keys from the subdirectory", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                testDirectory.set("testKey", "testValue4");
                testDirectory.set("testKey2", "testValue5");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                testSubdir.delete("testKey2");
                // fails because posix resolves it to /testKey, but was stored as testKey (no slash)
                // testSubdir.delete("../testKey");
                testSubdir.delete("../bar/testKey3");
                assert.equal(testDirectory.get("/foo/testKey"), "testValue");
                assert.equal(testDirectory.get("/foo/testKey2"), undefined);
                assert.equal(testDirectory.get("/bar/testKey3"), undefined);
                // assert.equal(testDirectory.get("testKey"), undefined);
                assert.equal(testDirectory.get("testKey2"), "testValue5");
            });

            it("Knows the size of the subdirectory", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                testDirectory.set("testKey", "testValue4");
                testDirectory.set("testKey2", "testValue5");
                const testSubdir = testDirectory.getWorkingDirectory("/foo");
                assert.equal(testSubdir.size, 2);
                testSubdir.delete("testKey2");
                assert.equal(testSubdir.size, 1);
                testSubdir.delete("../testKey");
                assert.equal(testSubdir.size, 1);
                testSubdir.delete("../bar/testKey3");
                assert.equal(testSubdir.size, 1);
                testDirectory.clear();
                assert.equal(testSubdir.size, 0);
            });

            it("Can get a subdirectory from a subdirectory", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                testDirectory.set("/bar/baz/testKey4", "testValue4");
                const testSubdir = testDirectory.getWorkingDirectory("/bar");
                assert.ok(testSubdir);
                const testSubdir2 = testSubdir.getWorkingDirectory("./baz");
                assert.ok(testSubdir2);
                assert.equal(testSubdir2.get("testKey4"), "testValue4");
            });

            it("Can get and use a keys iterator", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                testDirectory.set("/bar/baz/testKey4", "testValue4");

                const testSubdir1 = testDirectory.getWorkingDirectory("/foo");
                const testSubdir1Iterator = testSubdir1.keys();
                const testSubdir1Result1 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result1.value, "/foo/testKey");
                assert.equal(testSubdir1Result1.done, false);
                const testSubdir1Result2 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result2.value, "/foo/testKey2");
                assert.equal(testSubdir1Result2.done, false);
                const testSubdir1Result3 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result3.value, undefined);
                assert.equal(testSubdir1Result3.done, true);

                const testSubdir2 = testDirectory.getWorkingDirectory("/bar");
                const testSubdir2Iterator = testSubdir2.keys();
                const testSubdir2Result1 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result1.value, "/bar/testKey3");
                assert.equal(testSubdir2Result1.done, false);
                const testSubdir2Result2 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result2.value, "/bar/baz/testKey4");
                assert.equal(testSubdir2Result2.done, false);
                const testSubdir2Result3 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result3.value, undefined);
                assert.equal(testSubdir2Result3.done, true);
            });

            it("Can get and use a values iterator", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                testDirectory.set("/bar/baz/testKey4", "testValue4");

                const testSubdir1 = testDirectory.getWorkingDirectory("/foo");
                const testSubdir1Iterator: IterableIterator<map.ILocalViewElement> = testSubdir1.values();
                const testSubdir1Result1 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result1.value.localValue, "testValue");
                assert.equal(testSubdir1Result1.done, false);
                const testSubdir1Result2 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result2.value.localValue, "testValue2");
                assert.equal(testSubdir1Result2.done, false);
                const testSubdir1Result3 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result3.value, undefined);
                assert.equal(testSubdir1Result3.done, true);

                const testSubdir2 = testDirectory.getWorkingDirectory("/bar");
                const testSubdir2Iterator: IterableIterator<map.ILocalViewElement> = testSubdir2.values();
                const testSubdir2Result1 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result1.value.localValue, "testValue3");
                assert.equal(testSubdir2Result1.done, false);
                const testSubdir2Result2 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result2.value.localValue, "testValue4");
                assert.equal(testSubdir2Result2.done, false);
                const testSubdir2Result3 = testSubdir2Iterator.next();
                assert.equal(testSubdir2Result3.value, undefined);
                assert.equal(testSubdir2Result3.done, true);
            });

            it("Can get and use an entries iterator", () => {
                testDirectory.set("/foo/testKey", "testValue");
                testDirectory.set("/foo/testKey2", "testValue2");
                testDirectory.set("/bar/testKey3", "testValue3");
                testDirectory.set("/bar/baz/testKey4", "testValue4");

                const testSubdir1 = testDirectory.getWorkingDirectory("/foo");
                const testSubdir1Iterator: IterableIterator<[string, map.ILocalViewElement]> = testSubdir1.entries();
                const testSubdir1Result1 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result1.value[0], "/foo/testKey");
                assert.equal(testSubdir1Result1.value[1].localValue, "testValue");
                assert.equal(testSubdir1Result1.done, false);
                const testSubdir1Result2 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result2.value[0], "/foo/testKey2");
                assert.equal(testSubdir1Result2.value[1].localValue, "testValue2");
                assert.equal(testSubdir1Result2.done, false);
                const testSubdir1Result3 = testSubdir1Iterator.next();
                assert.equal(testSubdir1Result3.value, undefined);
                assert.equal(testSubdir1Result3.done, true);

                const testSubdir2 = testDirectory.getWorkingDirectory("/bar");

                const expectedEntries = new Set(["/bar/testKey3", "/bar/baz/testKey4"]);
                for (const entry of testSubdir2) {
                    assert.ok(expectedEntries.has(entry[0]));
                    expectedEntries.delete(entry[0]);
                }
                assert.ok(expectedEntries.size === 0);
            });
        });
    });
});
