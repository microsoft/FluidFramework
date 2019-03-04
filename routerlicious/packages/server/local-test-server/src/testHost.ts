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

    constructor() {
        super([]);
    }

    public async createComponent(id: string, type: string) {
        await this.host.createAndAttachComponent(id, type);
    }

    public openComponent<T extends IChaincodeComponent>(
        id: string,
        wait: boolean,
        services: ReadonlyArray<[string, Promise<any>]>,
    ) {
        return this.host.openComponent<T>(id, wait, services);
    }

    protected async create(): Promise<void> { /* do nothing */ }
    protected async opened(): Promise<void> { /* do nothing */ }
}

export class TestHost {
    private readonly testDeltaConnectionServer: ITestDeltaConnectionServer;
    private rootResolver: (accept: TestRootComponent) => void;

    // tslint:disable-next-line:promise-must-complete
    private root = new Promise<TestRootComponent>((accept) => { this.rootResolver = accept; });

    private components: IChaincodeComponent[] = [];

    constructor(registry: ReadonlyArray<[string, new () => IChaincodeComponent]>) {
        this.testDeltaConnectionServer = TestDeltaConnectionServer.Create();

        // tslint:disable:no-http-string - Allow fake test URLs when constructing DataStore.
        const store = new DataStore(
            "http://test-orderer-url.test",
            "http://test-storage-url.test",
            new TestLoader([
                [TestRootComponent.type, {
                    instantiateRuntime: (context) => Component.instantiateRuntime(
                        context,
                        TestRootComponent.type, registry.concat([[TestRootComponent.type, TestRootComponent]])) }],
            ]),
            createTestDocumentService(this.testDeltaConnectionServer),
            "tokenKey",
            "tenantId",
            "userId");

        store.open<TestRootComponent>("test-root-component", TestRootComponent.type, "")
            .then(this.rootResolver)
            .catch((reason) => { throw new Error(`${reason}`); });
    }

    public async createComponent<T extends IChaincodeComponent>(
        id: string,
        type: string,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ) {
        const root = await this.root;
        await root.createComponent(id, type);
        const component = await root.openComponent<T>(id, /* wait: */ true, services);
        this.components.push(component);
        return component;
    }

    public async close() {
        this.components.forEach((component) => component.close);
        await this.testDeltaConnectionServer.webSocketServer.close();
    }
}
