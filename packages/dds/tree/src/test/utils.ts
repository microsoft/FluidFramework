/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IContainer } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import {
    IChannelAttributes,
    IChannelServices,
    IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
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
import { ISummarizer } from "@fluidframework/container-runtime";
import { InvalidationToken, SimpleObservingDependent } from "../dependency-tracking";
import { ISharedTree, SharedTreeFactory } from "../shared-tree";
import { Delta } from "../tree";
import {
    mapFieldMarks,
    mapMarkList,
    mapTreeFromCursor,
    singleTextCursor,
} from "../feature-libraries";
import { RevisionTag } from "../core";
import { brand, makeArray } from "../util";

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
    private readonly summarizer?: ISummarizer;

    public get trees(): readonly ISharedTree[] {
        return this._trees;
    }

    public get containers(): readonly IContainer[] {
        return this._containers;
    }

    /**
     * Create a new {@link TestTreeProvider} with a number of trees pre-initialized.
     * @param trees - the number of trees to initialize this provider with. This is the same as calling
     * @param summarizeOnDemand - if `true`, summaries will only be made when `TestTreeProvider.summarize` is called.
     * @param factory - The factory to use for creating and loading trees. See {@link SharedTreeTestFactory}.
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
    public static async create(
        trees = 0,
        summarizeOnDemand = false,
        factory: SharedTreeFactory = new SharedTreeFactory(),
    ): Promise<ITestTreeProvider> {
        // The on-demand summarizer shares a container with the first tree, so at least one tree and container must be created right away.
        assert(
            !(trees === 0 && summarizeOnDemand),
            "trees must be >= 1 to allow summarization on demand",
        );

        const registry = [[TestTreeProvider.treeId, factory]] as ChannelFactoryRegistry;
        const driver = new LocalServerTestDriver();
        const objProvider = new TestObjectProvider(
            Loader,
            driver,
            () =>
                new TestContainerRuntimeFactory(
                    "@fluid-example/test-dataStore",
                    new TestFluidObjectFactory(registry),
                ),
        );

        if (summarizeOnDemand) {
            const container = await objProvider.makeTestContainer();
            const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
            const firstTree = await dataObject.getSharedObject<ISharedTree>(
                TestTreeProvider.treeId,
            );
            const summarizer = await createSummarizer(objProvider, container);
            const provider = new TestTreeProvider(objProvider, [
                container,
                firstTree,
                summarizer,
            ]) as ITestTreeProvider;
            for (let i = 1; i < trees; i++) {
                await provider.createTree();
            }
            return provider;
        } else {
            const provider = new TestTreeProvider(objProvider) as ITestTreeProvider;
            for (let i = 0; i < trees; i++) {
                await provider.createTree();
            }
            return provider;
        }
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
     * client for the container at the given index.  This can only be called when the summarizeOnDemand parameter
     * was set to true when calling the create() method.
     * @returns void after a summary has been resolved. May be called multiple times.
     */
    public async summarize(): Promise<void> {
        assert(
            this.summarizer !== undefined,
            "can't summarize because summarizeOnDemand was not set to true.",
        );
        await summarizeNow(this.summarizer, "TestTreeProvider");
    }

    public [Symbol.iterator](): IterableIterator<ISharedTree> {
        return this.trees[Symbol.iterator]();
    }

    private constructor(
        provider: ITestObjectProvider,
        firstTreeParams?: [IContainer, ISharedTree, ISummarizer],
    ) {
        this.provider = provider;
        if (firstTreeParams !== undefined) {
            const [container, firstTree, summarizer] = firstTreeParams;
            this._containers.push(container);
            this._trees.push(firstTree);
            this.summarizer = summarizer;
        }
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

/**
 * A test helper that allows custom code to be injected when a tree is created/loaded.
 */
export class SharedTreeTestFactory extends SharedTreeFactory {
    /**
     * @param onCreate - Called once for each created tree (not called for trees loaded from summaries).
     * @param onLoad - Called once for each tree that is loaded from a summary.
     */
    public constructor(
        private readonly onCreate: (tree: ISharedTree) => void,
        private readonly onLoad?: (tree: ISharedTree) => void,
    ) {
        super();
    }

    public override async load(
        runtime: IFluidDataStoreRuntime,
        id: string,
        services: IChannelServices,
        channelAttributes: Readonly<IChannelAttributes>,
    ): Promise<ISharedTree> {
        const tree = await super.load(runtime, id, services, channelAttributes);
        this.onLoad?.(tree);
        return tree;
    }

    public override create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
        const tree = super.create(runtime, id);
        this.onCreate(tree);
        return tree;
    }
}

export function noRepair(): Delta.ProtoNode[] {
    assert.fail("Unexpected request for repair data");
}

export function fakeRepair(
    _revision: RevisionTag,
    _index: number,
    count: number,
): Delta.ProtoNode[] {
    return makeArray(count, () => singleTextCursor({ type: brand("FakeRepairedNode") }));
}
