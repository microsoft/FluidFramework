/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { PrimedComponent, SharedComponentFactory } from "@prague/aqueduct";
import { IComponentLoadable } from "@prague/container-definitions";
import { SharedMap } from "@prague/map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedString, SparseMatrix } from "@prague/sequence";
import { ISharedObject } from "@prague/shared-object-common";
import {
    IDocumentDeltaEvent,
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestLoader,
} from ".";

// tslint:disable:array-type
/**
 * Basic component implementation for testing.
 */
class TestRootComponent extends PrimedComponent {
    /**
     * Type name of the component for the IComponentRegistryLookup
     */
    public static readonly type = "@chaincode/test-root-component";

    /**
     * Get the factory for the IComponentRegistry
     */
    public static getFactory() { return TestRootComponent.factory; }

    private static readonly factory = new SharedComponentFactory(
        TestRootComponent,
        [
            SharedMap.getFactory(),
            SharedString.getFactory(),
            SparseMatrix.getFactory(),
        ],
    );

    constructor(runtime: IComponentRuntime, context: IComponentContext) {
        super(runtime, context, []);
    }

    // tslint:disable-next-line: no-unnecessary-override
    public async createAndAttachComponent<T extends IComponentLoadable>(id: string, type: string): Promise<T> {
        return super.createAndAttachComponent<T>(id, type);
    }

    // tslint:disable-next-line: no-unnecessary-override
    public async waitComponent<T extends IComponentLoadable>(id: string): Promise<T> {
        return super.waitComponent<T>(id);
    }

    /**
     * Creates a channel and returns the instance as a shared object.
     * This will add the instance to the root map.
     * @param id - id of channel for new shared object
     * @param type - channel extension type
     */
    public createType<T extends ISharedObject>(id: string, type: string): T {
        const instance = this.runtime.createChannel(id, type) as T;
        this.root.set(id, instance);
        return instance;
    }

    /**
     * Gets and waits for the shared object with the given ID from the root map.
     * @param id - ID of shared object
     */
    public async getType<T extends ISharedObject>(id: string): Promise<T> {
        return this.root.wait(id) as Promise<T>;
    }

    /**
     * Gets and waits for the data with the given fence ID from the root map.
     * @param fenceId - fence ID of data
     */
    public async waitFor(fenceId: number) {
        const key = `fence-${fenceId}`;
        await this.root.wait(key);
    }

    /**
     * Sets a true value in the root map for the given fence ID.
     * @param fenceId - fence ID to mark
     */
    public mark(fenceId: number) {
        this.root.set(`fence-${fenceId}`, true);
    }

    /**
     * Removes the fence data from the root map for the given fence ID.
     * @param fenceId - fence ID to unmark
     */
    public unmark(fenceId: number) {
        this.root.delete(`fence-${fenceId}`);
    }

    /**
     * Simply returns this component runtime.
     */
    public getDocumentDeltaEvent(): IDocumentDeltaEvent  {
        return this.runtime;
    }

    protected async create(): Promise<void> {
        await super.create();
        this.root.set("ready", true);
    }

    protected async opened(): Promise<void> {
        await super.opened();
        await this.root.wait("ready");
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

    public readonly deltaConnectionServer: ITestDeltaConnectionServer;
    private rootResolver: (accept: TestRootComponent) => void;

    // tslint:disable-next-line:promise-must-complete
    private root = new Promise<TestRootComponent>((accept) => { this.rootResolver = accept; });

    /**
     * @param componentRegistry - array of key-value pairs of components available to the host
     * @param deltaConnectionServer - delta connection server for the ops
     */
    constructor(
        private readonly componentRegistry: ReadonlyArray<[string, Promise<IComponentFactory>]>,
        deltaConnectionServer?: ITestDeltaConnectionServer,
    ) {
        this.deltaConnectionServer = deltaConnectionServer || TestDeltaConnectionServer.create();

        // tslint:disable:no-http-string - Allow fake test URLs when constructing DataStore.
        const store = new DataStore(
            "http://test-orderer-url.test",
            "http://test-storage-url.test",
            new TestLoader([
                [TestRootComponent.type, {
                    instantiateRuntime: (context) => Component.instantiateRuntime(
                        context,
                        TestRootComponent.type,
                        new Map(componentRegistry.concat([
                            [
                                TestRootComponent.type,
                                // tslint:disable:no-function-expression
                                // tslint:disable:only-arrow-functions
                                Promise.resolve(TestRootComponent.getFactory()),
                            ],
                        ]))),
                }],
            ]),
            new TestDocumentServiceFactory(this.deltaConnectionServer),
            "tokenKey",
            "tenantId",
            "userId");

        store.open<TestRootComponent>("test-root-component", TestRootComponent.type, "")
            .then(this.rootResolver)
            .catch((reason) => { throw new Error(`${reason}`); });
    }

    /**
     * Creates and returns a new instance of a host with the same
     * component registry and delta connection server instance.
     */
    public clone(): TestHost {
        return new TestHost(
            this.componentRegistry,
            this.deltaConnectionServer);
    }

    /**
     * runs createComponent followed by openComponent
     * @param id component id
     * @param type component type
     * @param services component services for query interface
     * @returns Component object
     */
    public async createAndAttachComponent<T extends IComponentLoadable>(
        id: string,
        type: string,
        services?: [string, Promise<any>][],
    ): Promise<T> {
        const root = await this.root;
        return root.createAndAttachComponent<T>(id, type);
    }

    /**
     * Wait and get the compoent witht he id.
     * @param id component Id
     * @returns Component object
     */
    public async waitComponent<T extends IComponentLoadable>(
        id: string,
    ): Promise<T> {
        const root = await this.root;
        return root.waitComponent<T>(id);
    }

    /**
     * Creates and returns a new shared object in the root component.
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
