/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IFluidDataStoreContext } from "@fluidframework/runtime-definitions";
import { MockFluidDataStoreContext, validateAssertionError } from "@fluidframework/test-runtime-utils";
import { ISnapshotTree } from "@fluidframework/protocol-definitions";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "../dataStoreRuntime";
import { LocalChannelContext, RehydratedLocalChannelContext } from "../localChannelContext";

describe("LocalChannelContext Tests", () => {
    let dataStoreContext: MockFluidDataStoreContext;
    let sharedObjectRegistry: ISharedObjectRegistry;
    const loadRuntime = (context: IFluidDataStoreContext, registry: ISharedObjectRegistry) =>
        FluidDataStoreRuntime.load(context, registry, /* existing */ false);

    beforeEach(() => {
        dataStoreContext = new MockFluidDataStoreContext();
        sharedObjectRegistry = {
            get(name: string) {
                throw new Error("Not implemented");
            },
        };
    });

    it("LocalChannelContext rejects ids with forward slashes", () => {
        const invalidId = "beforeSlash/afterSlash";
        const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
        const codeBlock = () => new LocalChannelContext(invalidId, sharedObjectRegistry, "SomeType", dataStoreRuntime,
            dataStoreContext, dataStoreContext.storage, dataStoreContext.logger,
            () => {}, (s: string) => {}, (s) => {});
        assert.throws(codeBlock,
            (e) => validateAssertionError(e, "Channel context ID cannot contain slashes"),
            "Expected exception was not thrown");
    });

    it("RehydratedLocalChannelContext rejects ids with forward slashes", () => {
        const invalidId = "beforeSlash/afterSlash";
        const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
        const codeBlock = () => new RehydratedLocalChannelContext(invalidId, sharedObjectRegistry,
            dataStoreRuntime, dataStoreContext, dataStoreContext.storage, dataStoreContext.logger,
            (content, localOpMetadata) => {}, (s: string) => {}, (s, o) => {}, null as unknown as ISnapshotTree);
        assert.throws(codeBlock,
            (e) => validateAssertionError(e, "Channel context ID cannot contain slashes"),
            "Expected exception was not thrown");
    });
});
