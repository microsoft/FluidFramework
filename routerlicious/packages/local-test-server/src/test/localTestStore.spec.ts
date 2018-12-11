import { DataStore } from "@prague/datastore";
import * as loader from "@prague/loader";
import {
    ICodeLoader,
    IDocumentService,
    IPlatform,
    IPlatformFactory,
    IRuntime,
} from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import * as assert from "assert";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import {
    createTestDocumentService,
    TestDeltaConnectionServer,
    TestLoader,
} from "..";
import { ITestDeltaConnectionServer } from "../testDeltaConnectionServer";
import { TestComponent } from "./testComponent";

let testLoader: TestLoader;
let testDeltaConnectionServer: ITestDeltaConnectionServer;

interface IChaincodeLoaderConfig {
    codeLoader: ICodeLoader;
    documentService: IDocumentService;
    key: string;
    tenantId: string;
    tokenService: socketStorage.TokenService;
}

class HostPlatform extends EventEmitter implements IPlatform {
    private readonly services: Map<string, Promise<any>>;

    constructor(services?: ReadonlyArray<[string, Promise<any>]>) {
        super();
        this.services = new Map(services);
    }

    public queryInterface<T>(id: string): Promise<T> {
        return this.services.get(id) as Promise<T>;
    }
}

class HostPlatformFactory implements IPlatformFactory {
    constructor(private readonly services?: ReadonlyArray<[string, Promise<any>]>) { }

    public async create(): Promise<IPlatform> {
        return new HostPlatform(this.services);
    }
}

class ChaincodeLoader {
    private readonly config: IChaincodeLoaderConfig;

    constructor(codeLoader: ICodeLoader, documentService: IDocumentService, key: string, tenantId: string) {
        this.config = {
            codeLoader,
            documentService,
            key,
            tenantId,
            tokenService: new socketStorage.TokenService(),
        };
    }

    public async auth(tenantId: string, userId: string, documentId: string) {
        return jwt.sign(
            {
                documentId,
                permission: "read:write",       // use "read:write" for now
                tenantId,
                user: {
                    id: userId,
                },
            },
            this.config.key);
    }

    public async open<T>(
        chaincodePackage: string,
        loaderDoc: loader.Document,
    ): Promise<T> {

        if (!loaderDoc.existing) {
            console.log(`  not existing`);

            // Wait for connection so that proposals can be sent
            if (!loaderDoc.connected) {
                await new Promise<void>((resolve) => loaderDoc.once("connected", resolve));
            }

            console.log(`  now connected`);

            // And then make the proposal if a code proposal has not yet been made
            const quorum = loaderDoc.getQuorum();
            if (!quorum.has("code")) {
                console.log(`  prosposing code`);
                await quorum.propose("code", chaincodePackage);
            }

            console.log(`   code is ${quorum.get("code")}`);
        }

        // Return the constructed/loaded component.  We retrieve this via queryInterface on the
        // IPlatform created by ChainCode.run().  This arrives via the "runtimeChanged" event on
        // the loaderDoc.
        return new Promise<T>((resolver) => {
            loaderDoc.once("runtimeChanged", (runtime: IRuntime) => {
                resolver(runtime.platform.queryInterface("component"));
            });
        });
    }

    public async createDoc<T>(documentId: string, userId: string,
                              chaincodePackage: string, services?: ReadonlyArray<[string, Promise<any>]>) {
        console.log(`DataStore.open("${documentId}", "${userId}", "${chaincodePackage}")`);
        const config = this.config;
        const token = await this.auth(config.tenantId, userId, documentId);
        const factory = new HostPlatformFactory(services);
        return loader.load(documentId, config.tenantId, { id: userId },
                                      new socketStorage.TokenProvider(token), null,
                                      factory, config.documentService, config.codeLoader, undefined, true);
    }
}

describe("LocalTestDataStore", () => {
    it("open 2 Documents", async () => {
        testDeltaConnectionServer = TestDeltaConnectionServer.Create();
        testLoader = new TestLoader([
            [TestComponent.type, { instantiate: () => Promise.resolve(DataStore.instantiate(new TestComponent())) }],
        ]);
        const datastore1 = new ChaincodeLoader(
            testLoader,
            createTestDocumentService(testDeltaConnectionServer),
            "tokenKey",
            "tenantId");
        const loaderDoc1 = await datastore1.createDoc<TestComponent>("documentId", "userId", TestComponent.type);
        const doc1 = await datastore1.open<TestComponent>(TestComponent.type, loaderDoc1);
        assert.equal(doc1.count, 0, "Incorrect count in Doc1");

        doc1.increment();
        assert.equal(doc1.count, 1, "Incorrect count in Doc1 after increment");

        doc1.set("done1");
        const datastore2 = new ChaincodeLoader(
            testLoader,
            createTestDocumentService(testDeltaConnectionServer),
            "tokenKey",
            "tenantId");
        const loaderDoc2 = await datastore2.createDoc<TestComponent>("documentId", "userId", TestComponent.type);
        const doc2 = await datastore2.open<TestComponent>(TestComponent.type, loaderDoc2);
        await doc2.wait("done1");
        console.log("sync completed");
        assert.equal(doc2.count, 1, "Incorrect count in Doc2");

        doc2.increment();
        assert.equal(doc2.count, 2, "Incorrect count in Doc2 after increment");
        loaderDoc1.close();
        loaderDoc2.close();
     });

    after(async () => {
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
