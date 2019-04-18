"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const local_test_server_1 = require("@prague/local-test-server");
const datastore_1 = require("@prague/datastore");
const map_1 = require("@prague/map");
class Foo extends datastore_1.Component {
    constructor() {
        super([[map_1.MapExtension.Type, new map_1.MapExtension()]]);
    }
    async create(runtime, platform, root) { }
    async opened(runtime, platform, root) { }
}
(async () => {
    const store = new datastore_1.DataStore(new local_test_server_1.TestLoader([
        ["@chaincode/foo", { instantiate: () => Promise.resolve(datastore_1.DataStore.instantiate(new Foo())) }]
    ]), local_test_server_1.createTestDocumentService(local_test_server_1.TestDeltaConnectionServer.Create()), "tokenKey", "tenantId");
    return await store.open("documentId", "userId", "@chaincode/foo");
})().then(() => {
    console.log("done");
});
//# sourceMappingURL=index.js.map