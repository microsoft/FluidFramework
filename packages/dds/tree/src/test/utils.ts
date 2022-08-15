/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { LocalServerTestDriver } from "@fluidframework/test-drivers";
import {
    ITestObjectProvider,
    ChannelFactoryRegistry,
    TestObjectProvider,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    ITestFluidObject } from "@fluidframework/test-utils";
import { InvalidationToken, SimpleObservingDependent } from "../dependency-tracking";
import { SharedTree, SharedTreeFactory } from "../shared-tree";

// Testing utilities

export function deepFreeze<T>(object: T): void {
	// Retrieve the property names defined on object
	const propNames: (keyof T)[] = Object.getOwnPropertyNames(object) as (keyof T)[];
	// Freeze properties before freezing self
	for (const name of propNames) {
		const value = object[name];
		if (typeof value === "object") {
			deepFreeze(value);
		}
	}
	Object.freeze(object);
}

export class MockDependent extends SimpleObservingDependent {
	public readonly tokens: (InvalidationToken | undefined)[] = [];
	public constructor(name: string = "MockDependent") {
		super((token) => this.tokens.push(token), name);
	}
}

/**
 * A test helper class that manages the creation, connection and retrieval of SharedTrees. Instances of this
 * class are created via {@link create} and satisfy the {@link ITestObjectProvider} interface.
 */
export class TestTreeProvider {
    private static readonly treeId = "TestSharedTree";

    [tree: number]: SharedTree;

    private readonly provider: ITestObjectProvider;
    private readonly trees: SharedTree[] = [];

    /**
     * Create a new {@link TestTreeProvider}. The provider can be populated with trees via subsequent calls to
     * {@link createTree}. If the number of trees used by a test is known ahead of time, consider using
     * {@link createTrees} instead.
     */
    public static async create(): Promise<TestTreeProvider & ITestObjectProvider> {
        return new TestTreeProvider() as TestTreeProvider & ITestObjectProvider;
    }

    /**
     * Create a new {@link TestTreeProvider} with a number of trees pre-initialized.
     * @param trees - the number of trees to initialize this provider with. This is the same as calling
     * {@link create} followed by {@link createTree} _trees_ times.
     *
     * @example
     * ```ts
     * const trees = await TestTreeProvider.createTrees(2);
     * assert(trees[0].isAttached());
     * assert(trees[1].isAttached());
     * await trees.ensureSynchronized();
     * ```
     */
    public static async createTrees(trees: number): Promise<TestTreeProvider & ITestObjectProvider> {
        const provider = await this.create();
        for (let i = 0; i < trees; i++) {
            await provider.createTree();
        }
        return provider;
    }

    /**
     * Create and initialize a new {@link SharedTree} that is connected to all other trees from this provider.
     * @returns the tree that was created. For convenience, the tree can also be accessed via `this[i]` where
     * _i_ is the index of the tree in order of creation.
     */
    public async createTree(): Promise<SharedTree> {
        return this.createTreeAtIndex(this.trees.length);
    }

    public [Symbol.iterator](): IterableIterator<SharedTree> {
        return this.trees[Symbol.iterator]();
    }

    private constructor() {
        const factory = new SharedTreeFactory();
        const registry = [[TestTreeProvider.treeId, factory]] as ChannelFactoryRegistry;
        const driver = new LocalServerTestDriver();
        this.provider = new TestObjectProvider(
            Loader,
            driver,
            () => new TestContainerRuntimeFactory(
                "@fluid-example/test-dataStore",
                new TestFluidObjectFactory(registry),
            ),
        );

        return new Proxy(this, {
            get: (target, prop, receiver) => {
                // Intercept numbers and retrieve the associated tree, e.g. `testTreeProvider[0]`;
                if (typeof prop === "string") {
                    const treeIndex = Number.parseInt(prop, 10);
                    if (!Number.isNaN(treeIndex)) {
                        assert(treeIndex < this.trees.length, `treeIndex out of bounds (${treeIndex})`);
                        return this.trees[treeIndex];
                    }
                }

                // Route all properties that are on the `TestTreeProvider` itself
                if ((target as never)[prop] !== undefined) {
                    return Reflect.get(target, prop, receiver) as unknown;
                }

                // Route all other properties to the `TestObjectProvider`
                return Reflect.get(this.provider, prop, receiver) as unknown;
            },
        });
    }

    private async createTreeAtIndex(treeIndex: number): Promise<SharedTree> {
        assert(treeIndex >= 0, `treeIndex out of bounds (${treeIndex})`);
        if (treeIndex < this.trees.length) {
            return this.trees[treeIndex];
        }
        assert(treeIndex === this.trees.length, `treeIndex out of bounds (${treeIndex})`);

        const container = treeIndex === 0
        ? await this.provider.makeTestContainer()
        : await this.provider.loadTestContainer();

        const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
        this.trees[treeIndex] = await dataObject.getSharedObject<SharedTree>(TestTreeProvider.treeId);
        return this.trees[treeIndex];
    }
}
