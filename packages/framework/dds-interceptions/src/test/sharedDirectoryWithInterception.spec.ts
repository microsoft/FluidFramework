/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { IDirectory, SharedDirectory, DirectoryFactory } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { createDirectoryWithInterception } from "../map";

describe("Shared Directory with Interception", () => {
    describe("Simple User Attribution", () => {
        const userAttributes = { userId: "Fake User" };
        const documentId = "fakeId";
        const attributionDirectoryName = "attribution";
        const attributionKey = (key: string) => `${key}.attribution`;
        let deltaConnectionFactory: MockDeltaConnectionFactory;
        let sharedDirectory: SharedDirectory;
        let componentContext: IComponentContext;

        // This function gets / creates the attribution directory for the given subdirectory path.
        function getAttributionDirectory(root: IDirectory, path: string) {
            if (!root.hasSubDirectory(attributionDirectoryName)) {
                root.createSubDirectory(attributionDirectoryName);
            }

            let currentSubDir = root.getSubDirectory(attributionDirectoryName);
            if (path === "/") {
                return currentSubDir;
            }

            let prevSubDir = currentSubDir;
            const subdirs = path.substr(1).split("/");
            for (const subdir of subdirs) {
                currentSubDir = currentSubDir.getSubDirectory(subdir);
                if (currentSubDir === undefined) {
                    currentSubDir = prevSubDir.createSubDirectory(subdir);
                    break;
                }
                prevSubDir = currentSubDir;
            }
            return currentSubDir;
        }

        /**
         * This callback creates / gets an attribution directory that mirrors the actual directory. It sets the
         * user attribute in the attribution directory against the same key used in the original set.
         * For example - For directory /foo, it sets the attribute in /attribution/foo.
         */
        function mirrorDirectoryInterceptionCb(
            baseDirectory: IDirectory,
            subDirectory: IDirectory,
            key: string,
            value: any): void {
            const attributionDirectory: IDirectory = getAttributionDirectory(baseDirectory, subDirectory.absolutePath);
            attributionDirectory.set(key, userAttributes);
        }

        /**
         * This callback creates / gets an attribution directory that is a subdirectory of the given directory. It sets
         * the user attribute in the attribution directory againist the same key used in the original set.
         * For example - For directory /foo, it sets the attribute in /foo/attribute
         */
        function subDirectoryinterceptionCb(
            baseDirectory: IDirectory,
            subDirectory: IDirectory,
            key: string,
            value: any): void {
            if (!subDirectory.hasSubDirectory(attributionDirectoryName)) {
                subDirectory.createSubDirectory(attributionDirectoryName);
            }
            const attributionDirectory: IDirectory = subDirectory.getSubDirectory(attributionDirectoryName);
            attributionDirectory.set(key, userAttributes);
        }

        // This callback sets the user attribution in the subdirectory against a key derived from the original key.
        function setInterceptionCb(
            baseDirectory: IDirectory,
            subDirectory: IDirectory,
            key: string,
            value: any): void {
            subDirectory.set(attributionKey(key), userAttributes);
        }

        function orderSequentially(callback: () => void): void {
            callback();
        }

        beforeEach(() => {
            const runtime = new MockRuntime();
            deltaConnectionFactory = new MockDeltaConnectionFactory();
            sharedDirectory = new SharedDirectory(documentId, runtime, DirectoryFactory.Attributes);
            runtime.services = {
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
                objectStorage: new MockStorage(undefined),
            };
            runtime.attach();

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            componentContext = { containerRuntime: { orderSequentially } } as IComponentContext;
        });

        // Verifies that the props are stored correctly in the attribution sub directory - a sub directory
        // of the given directory with name `attributionDirectoryName`.
        function verifySubDirectoryArrtibution(directory: IDirectory, key: string, value: string, props?: any) {
            assert.equal(directory.get(key), value, "The retrieved value should match the value that was set");

            const attributionDir = directory.getSubDirectory(attributionDirectoryName);
            if (props === undefined) {
                assert.equal(
                    attributionDir,
                    undefined,
                    "The attribution directory should not exist because there was no interception");
            } else {
                assert.deepEqual(
                    attributionDir.get(key),
                    props,
                    "The user attributes set via the interception callback should exist.");
            }
        }

        // Verifies that the props are stored correctly in the given directory under a key derived from the
        // given key - under attributionKey(key).
        function verifyDirectoryAttribution(directory: IDirectory, key: string, value: string, props?: any) {
            assert.equal(directory.get(key), value, "The retrieved value should match the value that was set");

            if (props === undefined) {
                assert.equal(
                    directory.get(attributionKey(key)),
                    undefined,
                    "The user attributes should not exist because there was no interception");
            } else {
                assert.deepEqual(
                    directory.get(attributionKey(key)),
                    props,
                    "The user attributes set via the interception callback should exist.");
            }
        }

        /**
         * This test create two levels of directories as shown below:
         * /
         * /foo
         * /foo/bar
         *
         * It mirrors this directory structure for storing attributes as shown below. It uses the baseDirectory
         * in the interception callback to create this.
         * /attribution
         * /attribution/foo
         * /attribution/foo/bar
         *
         * It tests that the wrapper returns the correct baseDirectory (root in this case). It also tests that the
         * subdirectory created via the wrapper calls is wrapped and calls the interception callback.
         */
        it("should be able to create an attribution directory tree mirroring the actual directory tree", async () => {
            const root = createDirectoryWithInterception(
                sharedDirectory, componentContext, mirrorDirectoryInterceptionCb);

            const key: string = "level";
            let value: string = "root";
            root.set(key, value);
            assert.equal(root.get(key), value, "The retrieved value should match the value that was set");

            // Verify that attribution directory `/attribution` was created for root and the user attribute
            // set on it.
            const rootAttribution = root.getSubDirectory(attributionDirectoryName);
            assert.equal(
                rootAttribution.get(key), userAttributes, "The user attrributes set via callback should exist");

            // Create the level 1 directory `/foo`.
            const foo = root.createSubDirectory("foo");
            value = "level1";
            foo.set(key, value);
            assert.equal(foo.get(key), value, "The retrieved value should match the value that was set");

            // Verify that attribution directory `/attribution/foo` was created for /foo and the user attribute
            // set on it.
            const fooAttribution = rootAttribution.getSubDirectory("foo");
            assert.equal(
                fooAttribution.get(key), userAttributes, "The user attributes set via callback should exist");

            // Create the level 2 directory `/foo/bar`.
            const bar = foo.createSubDirectory("bar");
            value = "level2";
            bar.set(key, value);
            assert.equal(bar.get(key), value, "The retrieved value should match the value that was set");

            // Verify that attribution directory `/attribution/foo/bar` was created for /foo/bar and the user
            // attribute set on it.
            const barAttribution = fooAttribution.getSubDirectory("bar");
            assert.equal(
                barAttribution.get(key), userAttributes, "The user attributes set via callback should exist");
        });

        /**
         * This test create two levels of directories as shown below:
         * /
         * /foo
         * /foo/bar
         *
         * It creates an attribution subdirectory for each of the subdirectories as shown below:
         * /attribution
         * /foo/attribution
         * /foo/bar/attribution
         *
         * It tests that the wrapper returns the correct subDirectory.
         */
        it("should be able to create an attribution directory for each subdirectory", async () => {
            const root = createDirectoryWithInterception(sharedDirectory, componentContext, subDirectoryinterceptionCb);
            const key: string = "level";
            let value: string = "root";
            root.set(key, value);
            verifySubDirectoryArrtibution(root, key, value, userAttributes);

            // Create the level 1 directory `/foo`.
            const foo = root.createSubDirectory("foo");
            value = "level1";
            foo.set(key, value);
            verifySubDirectoryArrtibution(foo, key, value, userAttributes);

            // Create the level 2 directory `/foo/bar`.
            const bar = foo.createSubDirectory("bar");
            value = "level2";
            bar.set(key, value);
            verifySubDirectoryArrtibution(bar, key, value, userAttributes);
        });

        it("should be able to get a wrapped subDirectory via getSubDirectory and getWorkingDirectory", async () => {
            const root = createDirectoryWithInterception(sharedDirectory, componentContext, subDirectoryinterceptionCb);

            // Create a sub directory and get it via getSubDirectory.
            root.createSubDirectory("foo");
            const foo = root.getSubDirectory("foo");
            // Set a key and verify that user attribute is set via the interception callback.
            let key: string = "color";
            let value: string = "green";
            foo.set(key, value);
            verifySubDirectoryArrtibution(foo, key, value, userAttributes);

            // Create a sub directory via the unwrapped object and get its working directory via the wrapper.
            sharedDirectory.createSubDirectory("bar");
            const bar = root.getWorkingDirectory("bar");
            // Set a key and verify that user attribute is set via the interception callback.
            key = "permission";
            value = "read";
            bar.set(key, value);
            verifySubDirectoryArrtibution(bar, key, value, userAttributes);
        });

        /**
         * This test creates a wrapped shared directory. It then creates a subdirectory and creates another wrapper
         * from the subdirectory. It verifies that the callback for both the root directory and subdirectory is
         * called on a set on the wrapped subdirectory.
         */
        it("should be able to wrap a subDirectory in another interception wrapper", async () => {
            const root = createDirectoryWithInterception(sharedDirectory, componentContext, setInterceptionCb);

            // Create a sub directory via the wrapper and wrap it in another interception wrapper.
            const foo = root.createSubDirectory("foo");
            const userEmail = "test@microsoft.com";

            // Interception callback for wrapping the subdirectory that adds user email to the attribution.
            function interceptionCb(baseDirectory, subDirectory, key, value) {
                const attributes = subDirectory.get(attributionKey(key));
                subDirectory.set(attributionKey(key), { ...attributes, userEmail });
            }
            const fooWithAttribution = createDirectoryWithInterception(foo, componentContext, interceptionCb);

            // Set a key and verify that user id and user email are set via the interception callbacks.
            const permKey: string = "permission";
            const permValue: string = "write";
            fooWithAttribution.set(permKey, permValue);
            verifyDirectoryAttribution(fooWithAttribution, permKey, permValue, { ...userAttributes, userEmail });
        });

        it("should be able to see changes made by the wrapper from the underlying shared directory", async () => {
            const sharedDirectoryWithInterception =
                createDirectoryWithInterception(sharedDirectory, componentContext, setInterceptionCb);
            const key: string = "style";
            const value: string = "bold";
            sharedDirectoryWithInterception.set(key, value);
            verifyDirectoryAttribution(sharedDirectory, key, value, userAttributes);
        });

        it("should be able to see changes made by the underlying shared directory from the wrapper", async () => {
            const sharedDirectoryWithInterception =
                createDirectoryWithInterception(sharedDirectory, componentContext, setInterceptionCb);
            const key: string = "font";
            const value: string = "Arial";
            sharedDirectory.set(key, value);
            verifyDirectoryAttribution(sharedDirectoryWithInterception, key, value);
        });

        /**
         * This test calls set on the wrapper from the interception callback which will cause an infinite
         * recursion. Verify that the wrapper detects this and asserts.
         * Also, verify that the object is not unusable after the assert.
         */
        it("should assert if set is called on the wrapper from the callback causing infinite recursion", async () => {
            // eslint-disable-next-line prefer-const
            let sharedDirectoryWithInterception: SharedDirectory;

            let useWrapper: boolean = true;
            // If useWrapper above is true, this interception callback that calls a set on the wrapped object
            // causing an infinite recursion.
            // If useWrapper is false, it uses the passed subDirectory which does not cause recursion.
            function recursiveInterceptionCb(baseDirectory, subDirectory, key, value) {
                const directory = useWrapper ? sharedDirectoryWithInterception : subDirectory;
                directory.set(attributionKey(key), userAttributes);
            }

            // Create the interception wrapper with the above callback. The set method should throw an assertion as this
            // will cause infinite recursion.
            sharedDirectoryWithInterception =
                createDirectoryWithInterception(sharedDirectory, componentContext, recursiveInterceptionCb);

            let asserted: boolean = false;
            try {
                sharedDirectoryWithInterception.set("color", "green");
            } catch (error) {
                assert(error instanceof assert.AssertionError,
                    "We should have caught an assert in the set method because it detects an infinite recursion");
                asserted = true;
            }
            assert.equal(asserted, true, "The set call should have asserted because it detects inifinite recursion");

            // Set useWrapper to false and call set on the wrapper again. Verify that the object is still usable and
            // we do not get an assert anymore.
            useWrapper = false;
            const colorKey: string = "color";
            const colorValue: string = "red";
            sharedDirectoryWithInterception.set(colorKey, colorValue);
            verifyDirectoryAttribution(sharedDirectoryWithInterception, colorKey, colorValue, userAttributes);
        });
    });
});
