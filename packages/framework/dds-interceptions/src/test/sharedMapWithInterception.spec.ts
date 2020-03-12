/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { SharedMap } from "@microsoft/fluid-map";
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";
import { createSharedMapWithInterception } from "../map";

describe("Shared Map with Interception", () => {
    describe("Simple User Attribution", () => {
        /**
         * The following tests test simple user attribution in SharedMap with interception.
         * In the callback function of the SharedMap with inteception, it sets the user
         * attribution information in the underlying SharedMap against <key>.attribution.
         */
        const userId = "Fake User";
        const documentId = "fakeId";
        const attributionKey = (key: string) => `${key}.attribution`;
        let deltaConnectionFactory: MockDeltaConnectionFactory;
        let sharedMap: SharedMap;
        let sharedMapWithInterception: SharedMap;
        let componentContext: IComponentContext;

        function orderSequentially(callback: () => void): void {
            callback();
        }

        function interceptionCb(map: SharedMap, key: string, value: any): void {
            map.set(attributionKey(key), userId);
        }

        beforeEach(() => {
            const runtime = new MockRuntime();
            deltaConnectionFactory = new MockDeltaConnectionFactory();
            sharedMap = new SharedMap(documentId, runtime);
            runtime.services = {
                deltaConnection: deltaConnectionFactory.createDeltaConnection(runtime),
                objectStorage: new MockStorage(undefined),
            };
            runtime.attach();

            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            componentContext = { hostRuntime: { orderSequentially } } as IComponentContext;
            sharedMapWithInterception =
                createSharedMapWithInterception(sharedMap, componentContext, interceptionCb);
        });

        it("should be able to intercept SharedMap set method in the interception", async () => {
            const key: string = "color";
            const value: string = "green";
            sharedMapWithInterception.set(key, value);
            assert.equal(sharedMapWithInterception.get(key), value);
            assert.equal(sharedMapWithInterception.get(attributionKey(key)), userId);
        });

        it("should be able to see changes made by the interception from the underlying shared map", async () => {
            const key: string = "style";
            const value: string = "bold";
            sharedMapWithInterception.set(key, value);
            assert.equal(sharedMap.get(key), value);
            assert.equal(sharedMap.get(attributionKey(key)), userId);
        });

        it("should be able to see changes made by the underlying shared map from the interception", async () => {
            const key: string = "font";
            const value: string = "Arial";
            sharedMap.set(key, value);
            assert.equal(sharedMapWithInterception.get(key), value);
            // The userId should not exist because there should be no interception.
            assert.equal(sharedMapWithInterception.get(attributionKey(key)), undefined);
        });
    });
});
