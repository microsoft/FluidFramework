/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SummaryType } from "@fluidframework/protocol-definitions";
import {
    IContainerRuntimeBase,
    IGarbageCollectionData,
    IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions";
import { MockFluidDataStoreContext, validateAssertionError } from "@fluidframework/test-runtime-utils";
import { ContainerErrorType } from "@fluidframework/container-definitions";
import { FluidDataStoreRuntime, ISharedObjectRegistry } from "../dataStoreRuntime";

describe("FluidDataStoreRuntime Tests", () => {
    let dataStoreContext: MockFluidDataStoreContext;
    let sharedObjectRegistry: ISharedObjectRegistry;
    const loadRuntime = (context: IFluidDataStoreContext, registry: ISharedObjectRegistry) =>
        FluidDataStoreRuntime.load(context, registry, /* existing */ false);

    beforeEach(() => {
        dataStoreContext = new MockFluidDataStoreContext();
        // back-compat 0.38 - DataStoreRuntime looks in container runtime for certain properties that are unavailable
        // in the data store context.
        dataStoreContext.containerRuntime = {} as unknown as IContainerRuntimeBase;
        sharedObjectRegistry = {
            get(name: string) {
                throw new Error("Not implemented");
            },
        };
    });

    it("loadRuntime rejects ids with forward slashes", () => {
        const invalidId = "beforeSlash/afterSlash";
        dataStoreContext = new MockFluidDataStoreContext(invalidId);
        const codeBlock = () => loadRuntime(dataStoreContext, sharedObjectRegistry);
        assert.throws(codeBlock,
            (e) => validateAssertionError(e,
                "Id cannot contain slashes. DataStoreContext should have validated this."));
    });

    it("constructor rejects ids with forward slashes", () => {
        const invalidId = "beforeSlash/afterSlash";
        dataStoreContext = new MockFluidDataStoreContext(invalidId);
        const codeBlock = () => new FluidDataStoreRuntime(dataStoreContext, sharedObjectRegistry, false);
        assert.throws(codeBlock,
            (e) => validateAssertionError(e,
                "Id cannot contain slashes. DataStoreContext should have validated this."));
    });

    it("can create a data store runtime", () => {
        let failed: boolean = false;
        let dataStoreRuntime: FluidDataStoreRuntime | undefined;
        try {
            dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
        } catch (error) {
            failed = true;
        }
        assert.strictEqual(failed, false, "Data store runtime creation failed");
        assert.strictEqual(dataStoreRuntime?.id, dataStoreContext.id, "Data store runtime's id in incorrect");
    });

    it("can summarize an empty data store runtime", async () => {
        const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
        const summarizeResult = await dataStoreRuntime.summarize(true, false);
        assert(summarizeResult.summary.type === SummaryType.Tree, "Data store runtime did not return a summary tree");
        assert(Object.keys(summarizeResult.summary.tree).length === 0, "The summary should be empty");
    });

    it("can get GC data of an empty data store runtime", async () => {
        // The GC data should have a single node for the data store runtime with empty outbound routes.
        const expectedGCData: IGarbageCollectionData = {
            gcNodes: { "/": [] },
        };
        const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
        const gcData = await dataStoreRuntime.getGCData();
        assert.deepStrictEqual(gcData, expectedGCData, "The GC data is incorrect");
    });

    it("createChannel rejects ids with slashes", async () => {
        const dataStoreRuntime = loadRuntime(dataStoreContext, sharedObjectRegistry);
        const invalidId = "beforeSlash/afterSlash";
        const codeBlock = () => dataStoreRuntime.createChannel(invalidId, "SomeType");
        assert.throws(codeBlock,
            (e) => e.errorType === ContainerErrorType.usageError
                && e.message === `Id cannot contain slashes: ${invalidId}`);
    });
});
