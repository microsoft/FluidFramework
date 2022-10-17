/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
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
    ITestFluidObject,
    createSummarizer,
    summarizeNow,
} from "@fluidframework/test-utils";
import { InvalidationToken, SimpleObservingDependent } from "../dependency-tracking";
import { ISharedTree, SharedTreeFactory } from "../shared-tree";
import { Delta } from "../tree";
import { mapFieldMarks, mapMarkList, mapTreeFromCursor } from "../feature-libraries";

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
    private readonly _trees: ISharedTree[] = [];
    private readonly _containers: IContainer[] = [];

    public get trees(): readonly ISharedTree[] {
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
     * Create and initialize a new {@link ISharedTree} that is connected to all other trees from this provider.
     * @returns the tree that was created. For convenience, the tree can also be accessed via `this[i]` where
     * _i_ is the index of the tree in order of creation.
     */
    public async createTree(): Promise<ISharedTree> {
        const container =
            this.trees.length === 0
                ? await this.provider.makeTestContainer()
                : await this.provider.loadTestContainer();

        this._containers.push(container);
        const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
        return (this._trees[this.trees.length] = await dataObject.getSharedObject<ISharedTree>(
            TestTreeProvider.treeId,
        ));
    }

    /**
     * Give this {@link TestTreeProvider} the ability to summarize on demand during a test by creating a summarizer
     * client for the container at the given index. This must be called before any trees submit any edits, or else a
     * different summarizer client might already have been elected.
     * @param index - the container that will spawn the summarizer client
     * @returns a function which will cause a summary to happen when awaited. May be called multiple times.
     */
    public async enableManualSummarization(index = 0): Promise<() => Promise<void>> {
        assert(index < this.trees.length, "Index out of bounds: not enough trees");
        const summarizer = await createSummarizer(this.provider, this.containers[index]);
        return async () => {
            await summarizeNow(summarizer, "TestTreeProvider");
        };
    }

    public [Symbol.iterator](): IterableIterator<ISharedTree> {
        return this.trees[Symbol.iterator]();
    }

    private constructor() {
        const factory = new SharedTreeFactory();
        const registry = [[TestTreeProvider.treeId, factory]] as ChannelFactoryRegistry;
        const driver = new LocalServerTestDriver();
        this.provider = new TestObjectProvider(
            Loader,
            driver,
            () =>
                new TestContainerRuntimeFactory(
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

/**
 * Run a custom "spy function" every time the given method is invoked.
 * @param methodClass - the class that has the method
 * @param methodName - the name of the method
 * @param spy - the spy function to run alongside the method
 * @returns a function which will remove the spy function when invoked. Should be called exactly once
 * after the spy is no longer needed.
 */
export function spyOnMethod(
    // eslint-disable-next-line @typescript-eslint/ban-types
    methodClass: Function,
    methodName: string,
    spy: () => void,
): () => void {
    const { prototype } = methodClass;
    const method = prototype[methodName];
    assert(typeof method === "function", `Method does not exist: ${methodName}`);

    const methodSpy = function (this: unknown, ...args: unknown[]): unknown {
        spy();
        return method.call(this, ...args);
    };
    prototype[methodName] = methodSpy;

    return () => {
        prototype[methodName] = method;
    };
}

/**
 * Assert two MarkList are equal, handling cursors.
 */
export function assertMarkListEqual(a: Delta.MarkList, b: Delta.MarkList): void {
    const aTree = mapMarkList(a, mapTreeFromCursor);
    const bTree = mapMarkList(b, mapTreeFromCursor);
    assert.deepStrictEqual(aTree, bTree);
}

/**
 * Assert two Delta are equal, handling cursors.
 */
export function assertDeltaEqual(a: Delta.FieldMarks, b: Delta.FieldMarks): void {
    const aTree = mapFieldMarks(a, mapTreeFromCursor);
    const bTree = mapFieldMarks(b, mapTreeFromCursor);
    assert.deepStrictEqual(aTree, bTree);
}
