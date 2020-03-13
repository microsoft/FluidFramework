/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { MockDeltaConnectionFactory, MockRuntime, MockStorage } from "@microsoft/fluid-test-runtime-utils";
import { ISharedMap, SharedMap } from "@microsoft/fluid-map";
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

        function interceptionCb(map: ISharedMap, key: string, value: any): void {
            map.set(attributionKey(key), userId);
        }

        function recursiveInterceptionCb(map: ISharedMap, key: string, value: any): void {
            sharedMapWithInterception.set(attributionKey(key), userId);
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

        it("should be able to intercept SharedMap set method in the wrapper", async () => {
            const key: string = "color";
            const value: string = "green";
            sharedMapWithInterception.set(key, value);
            assert.equal(sharedMapWithInterception.get(key), value, "The value should match the value that was set");
            assert.equal(
                sharedMapWithInterception.get(attributionKey(key)),
                userId,
                "The userId set via interception callback should exist");
        });

        it("should be able to see changes made by the wrapper from the underlying shared map", async () => {
            const key: string = "style";
            const value: string = "bold";
            sharedMapWithInterception.set(key, value);
            assert.equal(sharedMap.get(key), value, "The value should match the value that was set by the wrapper");
            assert.equal(
                sharedMap.get(attributionKey(key)),
                userId,
                "The userId set via wrapper's interception callback should exist");
        });

        it("should be able to see changes made by the underlying shared map from the wrapper", async () => {
            const key: string = "font";
            const value: string = "Arial";
            sharedMap.set(key, value);
            assert.equal(
                sharedMapWithInterception.get(key),
                value,
                "The value should match the value that was set by the unwrapper map");
            assert.equal(
                sharedMapWithInterception.get(attributionKey(key)),
                undefined,
                "The userId should not be set because the interception is not called");
        });

        it("should assert it set is called from the callback as it will cause infinite recursion", async () => {
            // Create the interception wrapper with a callback that calls set on the wrapper. The set method should
            // throw an assertion as this will cause infinite recursion.
            sharedMapWithInterception =
                createSharedMapWithInterception(sharedMap, componentContext, recursiveInterceptionCb);
            const key: string = "font";
            const value: string = "Arial";
            let asserted: boolean = false;

            try {
                sharedMapWithInterception.set(key, value);
            } catch (error) {
                assert(error instanceof assert.AssertionError,
                    "We should have caught an assert in the set method because it detects an infinite recursion");
                asserted = true;
            }
            assert.equal(asserted, true, "The set call should have asserted because it detects inifinite recursion");
        });
    });
});
