import { TestDeltaConnectionServer, TestLoader, createTestDocumentService } from "@prague/local-test-server";
import { IRuntime, IPlatform } from "@prague/runtime-definitions";
import { Component, DataStore } from "@prague/datastore";
import { MapExtension, IMap, IMapView } from "@prague/map";

class Foo extends Component {
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    protected async create(runtime: IRuntime, platform: IPlatform, root: IMap) { }

    public async opened(runtime: IRuntime, platform: IPlatform, root: IMapView) { }    
}

(async () => {
    const store = new DataStore(
        new TestLoader([
            ["@chaincode/foo", { instantiate: () => Promise.resolve(DataStore.instantiate(new Foo())) }]
        ]),
        createTestDocumentService(TestDeltaConnectionServer.Create()),
        "tokenKey",
        "tenantId");

    return await store.open("documentId", "userId", "@chaincode/foo");
})().then(() => {
    console.log("done");
});