import { ISharedObject, ISharedObjectExtension } from "@prague/api-definitions";
import { Component } from "@prague/app-component";
import { DataStore } from "@prague/app-datastore";
import { IChaincodeComponent } from "@prague/runtime-definitions";
import {
    createTestDocumentService,
    ITestDeltaConnectionServer,
    TestDeltaConnectionServer,
    TestLoader,
} from ".";

class TestRootComponent extends Component {
    public static readonly type = "@chaincode/test-root-component";

    constructor(types: ReadonlyArray<[string, ISharedObjectExtension]>) {
        super(types);
    }

    public async createComponent(id: string, type: string) {
        await this.host.createAndAttachComponent(id, type);
    }

    public openComponent<T extends IChaincodeComponent>(
        id: string,
        wait: boolean,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ) {
        return this.host.openComponent<T>(id, wait, services);
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

    private readonly deltaConnectionServer: ITestDeltaConnectionServer;
    private rootResolver: (accept: TestRootComponent) => void;

    // tslint:disable-next-line:promise-must-complete
    private root = new Promise<TestRootComponent>((accept) => { this.rootResolver = accept; });

    private components: IChaincodeComponent[] = [];

    constructor(
        private readonly componentRegistry: ReadonlyArray<[string, new () => IChaincodeComponent]>,
        private readonly types?: ReadonlyArray<[string, ISharedObjectExtension]>,
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
                        componentRegistry.concat([[
                            TestRootComponent.type,
                            // tslint:disable:no-function-expression
                            // tslint:disable:only-arrow-functions
                            function(): IChaincodeComponent {
                                return new TestRootComponent(types || []);
                            } as any,
                        ]])),
                }],
            ]),
            createTestDocumentService(this.deltaConnectionServer),
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
            this.types,
            this.deltaConnectionServer);
    }

    public async createComponent<T extends IChaincodeComponent>(
        id: string,
        type: string,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ) {
        const root = await this.root;
        await root.createComponent(id, type);
        return this.openComponent<T>(id, services);
    }

    public async openComponent<T extends IChaincodeComponent>(
        id: string,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ) {
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

    public async close() {
        this.components.forEach((component) => component.close);
        await (await this.root).close();
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
