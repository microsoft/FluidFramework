import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { IComponent, IComponentFactory, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedStringExtension, SparseMatrixExtension } from "@prague/sequence";
import { ISharedObject } from "@prague/shared-object-common";
import {
    IDocumentDeltaEvent,
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestDocumentServiceFactory,
    TestLoader,
} from ".";

// tslint:disable:array-type
class TestRootComponent extends Component {
    public static readonly type = "@chaincode/test-root-component";

    constructor() {
        super([
            [SharedStringExtension.Type, new SharedStringExtension()],
            [SparseMatrixExtension.Type, new SparseMatrixExtension()],
        ]);
    }

    public async createComponent(id: string, type: string): Promise<IComponentRuntime> {
        return this.runtime.createAndAttachComponent(id, type);
    }

    public openComponent<T extends IComponent>(
        id: string,
        wait: boolean,
        services?: [string, Promise<any>][],
    ) {
        return this.runtime.openComponent<T>(id, wait, services);
    }

    public createType<T extends ISharedObject>(id: string, type: string) {
        const instance = this.runtime.createChannel(id, type) as T;
        this.root.set(id, instance);
        return instance;
    }

    public async getType<T extends ISharedObject>(id: string) {
        return this.root.wait(id) as Promise<T>;
    }

    public async waitFor(fenceId: number) {
        const key = `fence-${fenceId}`;
        await this.root.wait(key);
    }

    public mark(fenceId: number) {
        this.root.set(`fence-${fenceId}`, true);
    }

    public unmark(fenceId: number) {
        this.root.delete(`fence-${fenceId}`);
    }

    public getDocumentDeltaEvent(): IDocumentDeltaEvent  {
        return this.runtime;
    }

    protected async create(): Promise<void> {
        this.root.set("ready", true);
    }

    protected async opened(): Promise<void> {
        await this.connected;
        await this.root.wait("ready");
    }
}

let lastFence = 0;

export class TestHost {
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

    private components: IComponent[] = [];

    constructor(
        private readonly componentRegistry: ReadonlyArray<[string, Promise<IComponentFactory>]>,
        deltaConnectionServer?: ITestDeltaConnectionServer,
    ) {
        this.deltaConnectionServer = deltaConnectionServer || TestDeltaConnectionServer.Create();

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
                                Promise.resolve(Component.createComponentFactory(TestRootComponent)),
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

    public clone() {
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
    public async createAndOpenComponent<T extends IComponent>(
        id: string,
        type: string,
        services?: [string, Promise<any>][],
    ): Promise<T> {
        await this.createComponent(id, type);
        return this.openComponent<T>(id, services);
    }

    /**
     * Runs createAndAttachComponent on the underlying runtime
     * @param id component Id
     * @param type component type
     * @returns ComponentRuntime for the created component
     */
    public async createComponent(
        id: string,
        type: string,
    ): Promise<IComponentRuntime> {
        const root = await this.root;
        return root.createComponent(id, type);
    }

    /**
     * Runs openComponent on the underlying runtime
     * @param id component Id
     * @param services component services for query interface
     * @returns Component object
     */
    public async openComponent<T extends IComponent>(
        id: string,
        services?: [string, Promise<any>][],
    ): Promise<T> {
        const root = await this.root;
        const component = await root.openComponent<T>(id, /* wait: */ true, services);
        this.components.push(component);
        return component;
    }

    public async createType<T extends ISharedObject>(id: string, type: string): Promise<T> {
        const root = await this.root;
        return root.createType<T>(id, type);
    }

    public async getType<T extends ISharedObject>(id: string): Promise<T> {
        const root = await this.root;
        return root.getType<T>(id);
    }

    public async getDocumentDeltaEvent() {
        const root = await this.root;
        return root.getDocumentDeltaEvent();
    }

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
