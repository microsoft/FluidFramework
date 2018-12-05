// tslint:disable:no-unsafe-any
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

    constructor(codeLoader: ICodeLoader, documentService: any, key: string, tenantId: string) {
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
        documentId: string, userId: string,
        chaincodePackage: string,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ): Promise<T> {
        console.log(`DataStore.open("${documentId}", "${userId}", "${chaincodePackage}")`);
        const config = this.config;
        const token = await this.auth(config.tenantId, userId, documentId);
        const factory = new HostPlatformFactory(services);

        const loaderDoc = await loader.load(
            documentId,
            config.tenantId,
            {id: userId},
            new socketStorage.TokenProvider(token),
            null,
            factory,
            config.documentService,
            config.codeLoader,
            undefined,
            true);

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
}

describe("LocalTestDataStore", () => {
    before(() => {
        testDeltaConnectionServer = TestDeltaConnectionServer.Create();
        testLoader = new TestLoader([
            [TestComponent.type, { instantiate: () => Promise.resolve(DataStore.instantiate(new TestComponent())) }],
        ]);
    });

    it("open", async () => {
        const datastore = new ChaincodeLoader(
            testLoader,
            createTestDocumentService(testDeltaConnectionServer),
            "tokenKey",
            "tenantId");

        const doc = await datastore.open<TestComponent>("documentId", "userId", TestComponent.type);
        assert.equal(doc.count, 0);

        doc.increment();
        assert.equal(doc.count, 1);

        doc.set("done1");
    });

    it("open 2", async () => {
        const datastore = new ChaincodeLoader(
            testLoader,
            createTestDocumentService(testDeltaConnectionServer),
            "tokenKey",
            "tenantId");

        const doc = await datastore.open<TestComponent>("documentId", "userId", TestComponent.type);
        await doc.wait("done1");
        console.log("sync compoleted");
        assert.equal(doc.count, 1);

        doc.increment();
        assert.equal(doc.count, 2);
    });

    after(async () => {
        await testDeltaConnectionServer.webSocketServer.close();
    });
});
