/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import {
    ChannelFactoryRegistry,
    ITestFluidObject,
    ITestObjectProvider,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    TestObjectProvider } from "@fluidframework/test-utils";
import {
    Loader,
} from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalServerTestDriver } from "@fluidframework/test-drivers";
import { SharedTreeFactory, SharedTree } from "../../shared-tree";
import { TransactionResult } from "../../transaction";
import { singleTextCursor } from "../../feature-libraries";
import { brand } from "../../util";
import { detachedFieldAsKey } from "../../tree";
import { TreeNavigationResult } from "../../forest";

describe("SharedTree", () => {
    it("can be connected to another tree", async () => {
        const treeProvider = new TreeProvider();
        const treeA = await treeProvider[0];
        assert(treeA.isAttached());
        const treeB = await treeProvider[1];
        assert(treeB.isAttached());

        treeA.runTransaction((forest, editor) => {
            const writeCursor = singleTextCursor({ type: brand("Test"), value: "42" });
            editor.insert({
                parent: undefined,
                parentField: detachedFieldAsKey(forest.rootField),
                parentIndex: 0,
            }, writeCursor);

            return TransactionResult.Apply;
        });

        await treeProvider.provider.ensureSynchronized();
        const readCursor = treeB.forest.allocateCursor();
        const cursorResult = treeB.forest.tryMoveCursorTo(treeB.forest.root(treeB.forest.rootField), readCursor);
        assert(cursorResult === TreeNavigationResult.Ok);
        assert(readCursor.value === "42");
    });

    class TreeProvider {
        [tree: number]: Promise<SharedTree>;

        public readonly provider: ITestObjectProvider;
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
