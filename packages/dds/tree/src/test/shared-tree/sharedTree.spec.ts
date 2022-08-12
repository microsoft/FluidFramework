/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { IEvent, ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
    ChannelFactoryRegistry,
    fluidEntryPoint,
    IOpProcessingController,
    ITestContainerConfig,
    ITestFluidObject,
    ITestObjectProvider,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    TestObjectProvider } from "@fluidframework/test-utils";
import {
    IContainer, IFluidCodeDetails, IHostLoader,
} from "@fluidframework/container-definitions";
import {
    Container,
    ILoaderProps,
    Loader,
} from "@fluidframework/container-loader";
import {
    IChannelAttributes,
    IChannelFactory,
    IChannelStorageService,
} from "@fluidframework/datastore-definitions";
import { ISummaryTree, SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import {
    ITelemetryContext,
    ISummaryTreeWithStats,
    IGarbageCollectionData,
    IContainerRuntimeBase,
} from "@fluidframework/runtime-definitions";
import { mergeStats, requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalServerTestDriver } from "@fluidframework/test-drivers";
import { MockFluidDataStoreRuntime, MockSharedObjectServices } from "@fluidframework/test-runtime-utils";
import { IRequest, IRequestHeader } from "@fluidframework/core-interfaces";
import {
    Index,
    SharedTreeCore,
    SummaryElement,
    SummaryElementParser,
    SummaryElementStringifier,
} from "../../shared-tree-core";
import { AnchorSet } from "../../tree";
import { SharedTreeFactory, SharedTree } from "../../shared-tree";

describe("SharedTree", () => {
    it("can be connected to another tree", async () => {
        const treeProvider = new TreeProvider();
        const treeA = await treeProvider[0];
        assert(treeA.isAttached());
        const treeB = await treeProvider[1];
        assert(treeB.isAttached());
    });

    class TreeProvider {
        [tree: number]: Promise<SharedTree>;

        private readonly provider: ITestObjectProvider;
        private readonly trees: SharedTree[] = [];

        public constructor() {
            const factory = new SharedTreeFactory();
            const treeId = "TestSharedTree";
            const registry = [[treeId, factory]] as ChannelFactoryRegistry;
            const driver = new LocalServerTestDriver();
            this.provider = new TestObjectProvider(
                Loader,
                driver,
                () => new TestContainerRuntimeFactory(
                    "@fluid-example/test-dataStore",
                    new TestFluidObjectFactory(registry),
                    {
                        enableOfflineLoad: true,
                    },
                ),
            );

            return new Proxy(this, {
                get: async (target, prop, receiver) => {
                    if (typeof prop === "string") {
                        const treeIndex = Number.parseInt(prop, 10);
                        assert(treeIndex >= 0);
                        if (treeIndex < this.trees.length) {
                            return this.trees[treeIndex];
                        }
                        assert(treeIndex === this.trees.length);

                        const container = treeIndex === 0
                        ? await this.provider.makeTestContainer()
                        : await this.provider.loadTestContainer();

                        const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
                        this.trees[treeIndex] = await dataObject.getSharedObject<SharedTree>(treeId);
                        return this.trees[treeIndex];
                    }

                    return Reflect.get(target, prop, receiver) as unknown;
                },
            });
        }
    }
});
