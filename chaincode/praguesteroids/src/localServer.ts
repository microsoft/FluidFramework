import * as pragueLoader from "@prague/loader";
import { IChaincodeFactory, ICodeLoader, IPlatform } from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import * as testFactory from "./index";

export class WebPlatform extends EventEmitter implements IPlatform {
    constructor(private div: HTMLElement) {
        super();
    }

    public queryInterface<T>(id: string) {
        switch (id) {
            case "dom":
                return document;
            case "div":
                return this.div;
            default:
                return null;
        }
    }

    // Temporary measure to indicate the UI changed
    public update() {
        this.emit("update");
    }
}

export class CodeLoader implements ICodeLoader {
    constructor(private factory: IChaincodeFactory) {
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        return this.factory;
    }
}

const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

async function initializeChaincode(document: pragueLoader.Document, pkg: string): Promise<void> {
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

    const classicPlatform = new WebPlatform(document.getElementById("content"));
    const tokenService = new socketStorage.TokenService();
    const codeLoader = new CodeLoader(factory);

    const token = jwt.sign(
        {
            documentId: id,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    // Load the Prague document
    const loaderDoc = await pragueLoader.load(
        token,
        null,
        classicPlatform,
        service,
        codeLoader,
        tokenService);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!loaderDoc.existing) {
        await initializeChaincode(loaderDoc, `@local/test`).catch((error) => console.log("chaincode error", error));
    }
}

start("asteroids-00", testFactory).catch((error) => console.error(error));
