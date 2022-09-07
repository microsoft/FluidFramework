/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IEvent } from "@fluidframework/common-definitions";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { IContainer } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import { ISummaryTree, SummaryObject, SummaryType } from "@fluidframework/protocol-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { LocalServerTestDriver } from "@fluidframework/test-drivers";
import {
    ITestObjectProvider,
    ChannelFactoryRegistry,
    TestObjectProvider,
    TestContainerRuntimeFactory,
    TestFluidObjectFactory,
    ITestFluidObject } from "@fluidframework/test-utils";
import { SharedStack, SharedStackFactory } from "../sharedStack";

/**
 * Manages the creation, connection, and retrieval of SharedStacks and related components for ease of testing.
 * Satisfies the {@link ITestObjectProvider} interface.
 */
 export type ITestStackProvider<T> = TestStackProvider<T> & ITestObjectProvider;

 /**
  * A test helper class that manages the creation, connection and retrieval of SharedStacks. Instances of this
  * class are created via {@link create} and satisfy the {@link ITestObjectProvider} interface.
  */
export class TestStackProvider<T> {
    private static readonly stackId = "TestSharedStack";

    private readonly provider: ITestObjectProvider;
    private readonly _stacks: SharedStack<T>[] = [];
    private readonly _containers: IContainer[] = [];

    public get stacks(): readonly SharedStack<T>[] {
        return this._stacks;
    }

    public get containers(): readonly IContainer[] {
        return this._containers;
    }

    /**
     * Create a new {@link TestStackProvider} with a number of stacks pre-initialized.
     * @param stacks - the number of stacks to initialize this provider with. This is the same as calling
     * {@link create} followed by {@link createStack} _stacks_ times.
     *
     * @example
     * ```ts
     * const provider = await TestStackProvider.create(2);
     * assert(provider.stacks[0].isAttached());
     * assert(provider.stacks[1].isAttached());
     * await stacks.ensureSynchronized();
     * ```
     */
    public static async create<T>(stacks = 0): Promise<ITestStackProvider<T>> {
        const provider = new TestStackProvider() as ITestStackProvider<T>;
        for (let i = 0; i < stacks; i++) {
            await provider.createStack();
        }
        return provider;
    }

    /**
     * Create and initialize a new {@link SharedStack} that is connected to all other stacks from this provider.
     * @returns the stack that was created. For convenience, the stack can also be accessed via `this[i]` where
     * _i_ is the index of the stack in order of creation.
     */
    public async createStack(): Promise<SharedStack<T>> {
    const container = this.stacks.length === 0
        ? await this.provider.makeTestContainer()
        : await this.provider.loadTestContainer();

        this._containers[this._containers.length] = container;
        const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
        const stack = await dataObject.getSharedObject<SharedStack<T>>(TestStackProvider.stackId);
        (stack as any).providerIndex = this.stacks.length;
        this._stacks.push(stack);
        return stack;
    }

    public [Symbol.iterator](): IterableIterator<SharedStack> {
        return this.stacks[Symbol.iterator]();
    }

    private constructor() {
        const factory = new SharedStackFactory();
        const registry = [[TestStackProvider.stackId, factory]] as ChannelFactoryRegistry;
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
                // Route all properties that are on the `TestStackProvider` itself
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
 * Given the full summary tree for a container, return the subtree for the given `SharedObject`
 */
export function getSharedObjectSummary(fullSummary: ISummaryTree, sharedObject: ISharedObject): ISummaryTree | undefined {
    function tree(summaryObject: SummaryObject | undefined): ISummaryTree | undefined {
        if (summaryObject?.type === SummaryType.Tree) {
            return summaryObject;
        }

        return undefined;
    }

    return tree(tree(tree(tree(fullSummary.tree[".channels"])?.tree.default)?.tree[".channels"])?.tree[sharedObject.id]);
}

/**
 * Create an object which listens to the given event and counts how many times it fires
 */
export function countEvent<TEvent extends IEvent>(emitter: TypedEventEmitter<TEvent>, event: string): { count: number, dispose: () => void } {
    const counter = { count: 0, dispose: () => {} };
    const increment = () => {
        counter.count += 1;
    };
    counter.dispose = () => {
        counter.count = -1;
        emitter.off(event, increment);
    };
    emitter.on(event, increment);
    return counter;
}
