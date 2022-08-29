/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

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
 * Manages the creation, connection, and retrieval of SharedTrees and related components for ease of testing.
 * Satisfies the {@link ITestObjectProvider} interface.
 */
export type ITestTreeProvider = TestTreeProvider & ITestObjectProvider;

/**
 * A test helper class that manages the creation, connection and retrieval of SharedTrees. Instances of this
 * class are created via {@link create} and satisfy the {@link ITestObjectProvider} interface.
 */
export class TestTreeProvider {
    private static readonly treeId = "TestSharedTree";

    private readonly provider: ITestObjectProvider;
    private readonly _trees: SharedTree[] = [];
    private readonly _containers: IContainer[] = [];

    public get trees(): readonly SharedTree[] {
        return this._trees;
    }

    public get containers(): readonly IContainer[] {
        return this._containers;
    }

    /**
     * Create a new {@link TestTreeProvider} with a number of trees pre-initialized.
     * @param trees - the number of trees to initialize this provider with. This is the same as calling
     * {@link create} followed by {@link createTree} _trees_ times.
     *
     * @example
     * ```ts
     * const provider = await TestTreeProvider.create(2);
     * assert(provider.trees[0].isAttached());
     * assert(provider.trees[1].isAttached());
     * await trees.ensureSynchronized();
     * ```
     */
    public static async create(trees = 0): Promise<ITestTreeProvider> {
        const provider = new TestTreeProvider() as ITestTreeProvider;
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
        const container = this.trees.length === 0
        ? await this.provider.makeTestContainer()
        : await this.provider.loadTestContainer();

        const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
        return this._trees[this.trees.length] = await dataObject.getSharedObject<SharedTree>(TestTreeProvider.treeId);
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
                // Route all properties that are on the `TestTreeProvider` itself
                if ((target as never)[prop] !== undefined) {
                    return Reflect.get(target, prop, receiver) as unknown;
                }

                // Route all other properties to the `TestObjectProvider`
                return Reflect.get(this.provider, prop, receiver) as unknown;
            },
        });
    }
}
