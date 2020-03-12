/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { SharedDirectory, IDirectory } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { createSharedDirectoryWithInterception } from "../map";

describe("Shared Directory with Interception", () => {
    describe("Simple User Attribution", () => {
        /**
         * The following tests test simple user attribution in SharedDirecory with interception.
         * In the callback function of the SharedDirectory with interception, it sets the user
         * attribution information in a sub-directory of the underlying SharedDirectory against the same key.
         */
        const userId = "Fake User";
        const documentId = "fakeId";
        const attributionDirectoryName = "user-attribution";
        let deltaConnectionFactory: MockDeltaConnectionFactory;
        let sharedDirectory: SharedDirectory;
        let sharedDirectoryWithInterception: SharedDirectory;
        let componentContext: IComponentContext;

        function orderSequentially(callback: () => void): void {
            callback();
        }

        function interceptionCb(directory: IDirectory, key: string, value: any): void {
            if (!directory.hasSubDirectory(attributionDirectoryName)) {
                directory.createSubDirectory(attributionDirectoryName);
            }
            const attributionDirectory: IDirectory = directory.getSubDirectory(attributionDirectoryName);
            attributionDirectory.set(key, userId);
        }

        beforeEach(() => {
            const runtime = new MockRuntime();
            deltaConnectionFactory = new MockDeltaConnectionFactory();
            sharedDirectory = new SharedDirectory(documentId, runtime);
            runtime.services = {
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
                objectStorage: new MockStorage(undefined),
            };
            runtime.attach();

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            componentContext = { hostRuntime: { orderSequentially } } as IComponentContext;
            sharedDirectoryWithInterception =
                createSharedDirectoryWithInterception(sharedDirectory, componentContext, interceptionCb);
        });

        it("should be able to intercept SharedDirectory set method in the interception", async () => {
            const key: string = "color";
            const value: string = "green";
            sharedDirectoryWithInterception.set(key, value);
            assert.equal(sharedDirectoryWithInterception.get(key), value);

            const attributionDirectory: IDirectory =
                sharedDirectoryWithInterception.getSubDirectory(attributionDirectoryName);
            assert.equal(attributionDirectory.get(key), userId);

            // Verify that the attributionDirectory doesn't create another attribution sub directory. The
            // attributionDirectory is created via the underlying shared directory and not via the shared
            // directory with attribution.
            assert.equal(attributionDirectory.getSubDirectory(attributionDirectoryName), undefined);
        });

        it("should be able to see changes made by the interception from the underlying shared directory", async () => {
            const key: string = "style";
            const value: string = "bold";
            sharedDirectoryWithInterception.set(key, value);
            assert.equal(sharedDirectory.get(key), value);

            const attributionDirectory: IDirectory = sharedDirectory.getSubDirectory(attributionDirectoryName);
            assert.equal(attributionDirectory.get(key), userId);
        });

        it("should be able to see changes made by the underlying shared directory from the interception", async () => {
            const key: string = "font";
            const value: string = "Arial";
            sharedDirectory.set(key, value);
            assert.equal(sharedDirectoryWithInterception.get(key), value);

            const attributionDirectory: IDirectory =
                sharedDirectoryWithInterception.getSubDirectory(attributionDirectoryName);
            // The attributionDirectory should not exist because there should be no interception.
            assert.equal(attributionDirectory, undefined);
        });

        it("should be able create a sub directory with interception from the shared directory", async () => {
            const key: string = "font";
            const value: string = "Arial";

            const subDirectoryWithInterception = sharedDirectoryWithInterception.createSubDirectory("foo");
            subDirectoryWithInterception.set(key, value);
            assert.equal(subDirectoryWithInterception.get(key), value);

            const attributionDirectory: IDirectory =
                subDirectoryWithInterception.getSubDirectory(attributionDirectoryName);
            assert.equal(attributionDirectory.get(key), userId);
        });
    });
});
