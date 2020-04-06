/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    PrimedComponent,
    PrimedComponentFactory,
    SimpleContainerRuntimeFactory,
    ContainerServiceRegistryEntries,
} from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHandle,
    IComponentLoadable,
    IComponentRunnable,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import {
    IComponentContext,
    IComponentRuntime,
    NamedComponentRegistryEntries,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObject, ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import { ILocalDeltaConnectionServer, LocalDeltaConnectionServer } from "@microsoft/fluid-server-local-server";
import {
    IDocumentDeltaEvent,
    TestDocumentServiceFactory,
    TestResolver,
} from "@microsoft/fluid-local-driver";
import { TestDataStore } from "./testDataStore";
import { TestCodeLoader } from "./";

/**
 * Basic component implementation for testing.
 */
class TestRootComponent extends PrimedComponent implements IComponentRunnable {
    public get IComponentRunnable() { return this; }

    /**
     * Type name of the component for the IComponentRegistryLookup
     */
    public static readonly type: string = "@chaincode/test-root-component";

    public static readonly codeProposal: IFluidCodeDetails = {
        package: TestRootComponent.type,
        config: {},
    };

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context);
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public run = () => Promise.resolve();

    // Make this function public so TestHost can use them
    public async createAndAttachComponent<T extends IComponentLoadable>(
        type: string, props?: any,
    ): Promise<T> {
        return super.createAndAttachComponent<T>(type, props);
    }

    // Make this function public so TestHost can use them
    public async getComponent_UNSAFE<T>(id: string): Promise<T> {
        return super.getComponent_UNSAFE<T>(id);
    }

    /**
     * Creates a channel and returns the instance as a shared object.
     * This will add the instance to the root directory.
     * @param id - id of channel for new shared object
     * @param type - channel factory type
     */
    public createType<T extends ISharedObject>(id: string, type: string): T {
        try {
            const instance = this.runtime.createChannel(id, type) as T;
            this.root.set(id, instance.handle);
            return instance;
        } catch (error) {
            // Tweak the error message to help users with the most common failure cause.
            throw new Error(`'${type}.getFactory()' must be provided to TestHost ctor: ${error}`);
        }
    }

    /**
     * Gets and waits for the shared object with the given ID from the root directory.
     * @param id - ID of shared object
     */
    public async getType<T extends ISharedObject>(id: string): Promise<T> {
        const handle = await this.root.wait<IComponentHandle<T>>(id);
        return handle.get();
    }

    /**
     * Gets and waits for the data with the given fence ID from the root directory.
     * @param fenceId - fence ID of data
     */
    public async waitFor(fenceId: number) {
        const key = `fence-${fenceId}`;
        await this.root.wait(key);
    }

    /**
     * Sets a true value in the root directory for the given fence ID.
     * @param fenceId - fence ID to mark
     */
    public mark(fenceId: number) {
        this.root.set(`fence-${fenceId}`, true);
    }

    /**
     * Removes the fence data from the root directory for the given fence ID.
     * @param fenceId - fence ID to unmark
     */
    public unmark(fenceId: number) {
        this.root.delete(`fence-${fenceId}`);
    }

    /**
     * Simply returns this component runtime.
     */
    public getDocumentDeltaEvent(): IDocumentDeltaEvent {
        return this.runtime;
    }
}

let lastFence = 0;

/**
 * Basic implementation of a host application for testing.
 */
export class TestHost {
    /**
     * Syncs an array of hosts together by marking their fence ID, waiting for that
     * fence ID from all other hosts, and then unmarking it.
     * @param hosts - array of hosts to sync
     */
    public static async sync(...hosts: TestHost[]) {
        for (const host of hosts) {
            const fence = await host.mark();
            for (const other of hosts) {
                if (other === host) {
                    continue;
                }
                await other.waitFor(fence);
            }
            await host.unmark(fence);
        }
    }

    public readonly deltaConnectionServer: ILocalDeltaConnectionServer;

    private readonly root: Promise<TestRootComponent>;

    /**
     * @param componentRegistry - array of key-value pairs of components available to the host
     * @param sharedObjectFactories - Shared object factories used by `createType()`
     * @param deltaConnectionServer - delta connection server for the ops
     */
    constructor(
        private readonly componentRegistry: NamedComponentRegistryEntries,
        private readonly sharedObjectFactories: readonly ISharedObjectFactory[] = [],
        deltaConnectionServer?: ILocalDeltaConnectionServer,
        private readonly scope: IComponent = {},
        private readonly containerServiceRegistry: ContainerServiceRegistryEntries = [],
    ) {
        this.deltaConnectionServer = deltaConnectionServer || LocalDeltaConnectionServer.create();

        const runtimeFactory = {
            IRuntimeFactory: undefined,
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            instantiateRuntime: (context) => SimpleContainerRuntimeFactory.instantiateRuntime(
                context,
                TestRootComponent.type,
                [
                    ...componentRegistry,
                    [TestRootComponent.type, Promise.resolve(
                        new PrimedComponentFactory(TestRootComponent, sharedObjectFactories),
                    )],
                ],
                this.containerServiceRegistry),
        };
        runtimeFactory.IRuntimeFactory = runtimeFactory;

        const store = new TestDataStore(
            new TestCodeLoader([
                [
                    TestRootComponent.type,
                    runtimeFactory,
                ],
            ]),
            new TestDocumentServiceFactory(this.deltaConnectionServer),
            new TestResolver());

        this.root = store.open<TestRootComponent>("test-root-component", TestRootComponent.codeProposal, "", scope);
    }

    /**
     * Creates and returns a new instance of a host with the same
     * component registry and delta connection server instance.
     */
    public clone(): TestHost {
        return new TestHost(
            this.componentRegistry,
            this.sharedObjectFactories,
            this.deltaConnectionServer,
            this.scope,
            this.containerServiceRegistry);
    }

    /**
     * Runs createComponent followed by openComponent
     * @param id component id
     * @param type component type
     * @param services component services for query interface
     * @returns Component object
     */
    public async createAndAttachComponent<T extends IComponentLoadable>(
        type: string,
        props?: any,
    ): Promise<T> {
        const root = await this.root;
        return root.createAndAttachComponent<T>(type, props);
    }

    /* Wait and get the component with the id.
     * @param id component Id
     * @returns Component object
     */
    public async getComponent_UNSAFE<T>(id: string): Promise<T> {
        const root = await this.root;
        return root.getComponent_UNSAFE<T>(id);
    }

    /**
     * Creates and returns a new shared object instance the root component.  The `ISharedObjectFactory`
     * for the given `type` must be provided to the TestHost ctor.
     * @param id - ID of new shared object
     * @param type - type of new shared object
     */
    public async createType<T extends ISharedObject>(id: string, type: string): Promise<T> {
        const root = await this.root;
        return root.createType<T>(id, type);
    }

    /**
     * Gets and waits for the shared object with the given ID from the root component.
     * @param id - ID of shared object
     */
    public async getType<T extends ISharedObject>(id: string): Promise<T> {
        const root = await this.root;
        return root.getType<T>(id);
    }

    /**
     * Simply returns the root component's component runtime.
     */
    public async getDocumentDeltaEvent(): Promise<IDocumentDeltaEvent> {
        const root = await this.root;
        return root.getDocumentDeltaEvent();
    }

    /**
     * Closes the delta connection server's web socket.
     */
    public async close() {
        await this.deltaConnectionServer.webSocketServer.close();
    }

    private async mark() {
        lastFence += 1;
        (await this.root).mark(lastFence);
        return lastFence;
    }

    private async waitFor(id: number) {
        return (await this.root).waitFor(id);
    }

    private async unmark(id: number) {
        (await this.root).unmark(id);
    }
}
