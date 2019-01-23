import {
    IChaincodeComponent,
    IChaincodeFactory,
    IChaincodeHost,
    ICodeLoader,
    IHostRuntime,
} from "@prague/process-definitions";
import * as pragueLoader from "@prague/process-loader";
import { IPlatform } from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";
import { MyPlatform } from "./legacyPlatform";
import * as sharedText from "./legacySharedText";
import * as pinpoint from "./pinpointEditor";
import { WebPlatformFactory } from "./webPlatform";

export class CodeLoader implements ICodeLoader {
    constructor(private factory: IChaincodeFactory) {
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        return this.factory;
    }
}

const sharedTextPkg = true;
const basePackage = sharedTextPkg ? "@chaincode/shared-text" : "@prague/pinpoint-editor";

class MyChaincodeHost implements IChaincodeHost {
    public async getModule(type: string) {
        switch (type) {
            case "@chaincode/shared-text":
                return sharedText;

            case "@prague/pinpoint-editor":
                return pinpoint;

                default:
            return Promise.reject("Unknown component");
        }
    }

    public async close(): Promise<void> {
        return;
    }

    // I believe that runtime needs to have everything necessary for this thing to actually load itself once this
    // method is called
    public async run(runtime: IHostRuntime, platform: IPlatform): Promise<IPlatform> {
        this.doWork(runtime).catch((error) => {
            runtime.error(error);
        });

        return new MyPlatform();
    }

    public async doWork(runtime: IHostRuntime) {
        if (!runtime.existing) {
            await runtime.createAndAttachProcess("text", basePackage);
        } else {
            await runtime.getProcess("text");
        }

        console.log("Running, running, running");
    }
}

export class TestCode implements IChaincodeFactory {
    public instantiateComponent(): Promise<IChaincodeComponent> {
        throw new Error("Method not implemented.");
    }

    public async instantiateHost(): Promise<IChaincodeHost> {
        return new MyChaincodeHost();
    }
}

const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

async function initializeChaincode(document: pragueLoader.DistributedProcess, pkg: string): Promise<void> {
    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code")) {
        await quorum.propose("code", pkg);
    }

    console.log(`Code is ${quorum.get("code")}`);
}

/**
 * Loads a specific version (commit) of the collaborative object
 */
export async function start(id: string, factory: IChaincodeFactory): Promise<void> {
    const service = socketStorage.createDocumentService(routerlicious, historian);

    const classicPlatform = new WebPlatformFactory(document.getElementById("content"));
    const codeLoader = new CodeLoader(factory);

    const user = { id: "test" };
    const token = jwt.sign(
        {
            documentId: id,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user,
        },
        secret);
    const tokenProvider = new socketStorage.TokenProvider(token);

    // Load the Prague document
    const loaderDoc = await pragueLoader.load(
        id,
        tenantId,
        user,
        tokenProvider,
        { blockUpdateMarkers: true },
        classicPlatform,
        service,
        codeLoader);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!loaderDoc.existing) {
        await initializeChaincode(loaderDoc, `@local/test`).catch((error) => console.log("chaincode error", error));
    }
}

const testCode = new TestCode();
const documentId = window.location.search ? window.location.search.substr(1) : "test-document";
console.log(`Loading ${documentId}`);
start(documentId, testCode).catch((err) => console.error(err));
