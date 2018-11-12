import * as pragueLoader from "@prague/loader";
import { IMap, MapExtension } from "@prague/map";
import {
    IChaincode,
    IChaincodeFactory,
    ICodeLoader,
    IPlatform,
    IPlatformFactory,
    IRuntime,
    ITokenProvider,
    IUser,
} from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import { Deferred } from "@prague/utils";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import * as uuid from "uuid/v4";
import { debug } from "./debug";
import { globalConfig } from "./globalConfig";

const localServer = "localhost";

// For local development
const localSettings = {
    historian: "http://" + localServer + ":3001",
    routerlicious: "http://" + localServer + ":3000",
    secret: "43cfc3fbf04a97c0921fd23ff10f9e4b",
    tenantId: "prague",
};
const remoteSettings = {
    historian: "https://historian.eu.prague.office-int.com",
    routerlicious: "https://alfred.eu.prague.office-int.com",
    secret: "04d35da60eed66c9a2272bdf310d076e",
    tenantId: "trusting-tesla",
};

const settings = globalConfig.useLocalServer ? localSettings : remoteSettings;

// Register endpoint connection
const documentServices = socketStorage.createDocumentService(settings.routerlicious, settings.historian);

export class Platform extends EventEmitter implements IPlatform {
    public queryInterface<T>(id: string) {
        return null;
    }
}

export class PlatformFactory implements IPlatformFactory {
    public async create(): Promise<IPlatform> {
        return new Platform();
    }
}

// tslint:disable-next-line
const npmPackage = require("../package.json");
const apiName = npmPackage.name;
const apiVersion = npmPackage.version;
const rootMapId = "root";
const insightsMapId = "insights";

class Chaincode implements IChaincode {
    private modules = new Map<string, any>();

    constructor(private runner: (runtime: IRuntime, platform: IPlatform) => Promise<IPlatform>) {
        // Register default map value types
        // pragueMap.registerDefaultValueType(new pragueMap.DistributedSetValueType());
        // pragueMap.registerDefaultValueType(new pragueMap.CounterValueType());
        // pragueMap.registerDefaultValueType(new sharedString.SharedStringIntervalCollectionValueType());
        // pragueMap.registerDefaultValueType(new sharedString.SharedIntervalCollectionValueType());

        // Create channel extensions
        const mapExtension = new MapExtension();
        // const sharedStringExtension = new sharedString.CollaborativeStringExtension();
        // const streamExtension = new stream.StreamExtension();
        // const cellExtension = new cell.CellExtension();

        // Register channel extensions
        this.modules.set(mapExtension.type, mapExtension);
        // this.modules.set(sharedStringExtension.type, sharedStringExtension);
        // this.modules.set(streamExtension.type, streamExtension);
        // this.modules.set(cellExtension.type, cellExtension);
    }

    public getModule(type: string): any {
        return this.modules.get(type);
    }

    public close(): Promise<void> {
        return Promise.resolve();
    }

    public run(runtime: IRuntime, platform: IPlatform): Promise<IPlatform> {
        return this.runner(runtime, platform);
    }
}

class ChaincodeFactory implements IChaincodeFactory {
    constructor(private runner: (runtime: IRuntime, platform: IPlatform) => Promise<IPlatform>) {
    }

    public instantiate(): Promise<IChaincode> {
        const chaincode = new Chaincode(this.runner);
        return Promise.resolve(chaincode);
    }
}

class CodeLoader implements ICodeLoader {
    private factory: IChaincodeFactory;

    constructor(runner: (runtime: IRuntime, platform: IPlatform) => Promise<IPlatform>) {
        this.factory = new ChaincodeFactory(runner);
    }

    public load(source: string): Promise<IChaincodeFactory> {
        return Promise.resolve(this.factory);
    }
}

async function initializeChaincode(loaderDoc: pragueLoader.Document, pkg: string): Promise<void> {
    const quorum = loaderDoc.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!loaderDoc.connected) {
        // tslint:disable-next-line
        await new Promise<void>((resolve) => loaderDoc.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code")) {
        await quorum.propose("code", pkg);
    }

    // tslint:disable-next-line:no-backbone-get-set-outside-model
    debug(`Code is ${quorum.get("code")}`);
}

export class PragueDocument {
    public static async Load(
        id: string,
        tenantId: string,
        user: IUser,
        tokenProvider: ITokenProvider,
        options: any = {},
        waitForConnected = true) {
        const classicPlatform = new PlatformFactory();
        const runDeferred = new Deferred<{ runtime: IRuntime; platform: IPlatform }>();
        const loader = new CodeLoader(
            async (r, p) => {
                debug("Code loaded and resolved");
                runDeferred.resolve({ runtime: r, platform: p });
                return null;
            });

        // Load the Prague document
        const loaderDoc = await pragueLoader.load(
            id,
            tenantId,
            user,
            tokenProvider,
            options,
            classicPlatform,
            documentServices,
            loader);

        // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
        // package.
        if (!loaderDoc.existing) {
            initializeChaincode(loaderDoc, `${apiName}@${apiVersion}`)
                .catch((error) => debug("chaincode error", error));
        }

        // Wait for loader to start us
        const { runtime } = await runDeferred.promise;

        // Initialize core data structures
        let root: IMap;
        if (!runtime.existing) {
            root = runtime.createChannel(rootMapId, MapExtension.Type) as IMap;
            root.attach();

            const insights = runtime.createChannel(insightsMapId, MapExtension.Type);
            root.set(insightsMapId, insights);
        } else {
            root = await runtime.getChannel("root") as IMap;
        }

        if (!loaderDoc.connected && waitForConnected) {
            await new Promise<void>((resolve) => loaderDoc.once("connected", () => resolve()));
        }

        // Return the document
        const document = new PragueDocument(runtime, root);

        return document;
    }

    private constructor(public runtime: IRuntime, private root: IMap) {
    }

    public getRoot(): IMap {
        return this.root;
    }

    public createMap(): IMap {
        return this.runtime.createChannel(uuid(), MapExtension.Type) as IMap;
    }
}

export async function getCollabDoc(documentId: string): Promise<PragueDocument> {
    const user = {
        id: "test",
    };
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId: settings.tenantId,
            user,
        },
        settings.secret);

    // Load in the latest and connect to the document
    const tokenProvider = new socketStorage.TokenProvider(token);
    const collabDoc = await PragueDocument.Load(
        documentId,
        settings.tenantId,
        user,
        tokenProvider,
        { blockUpdateMarkers: true },
        globalConfig.docWaitForConnect);

    return collabDoc;
}
