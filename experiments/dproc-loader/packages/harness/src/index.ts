import * as sharedText from "@chaincode/shared-text";
import { IChaincodeFactory, ICodeLoader } from "@prague/container-definitions";
import { Container } from "@prague/container-loader";
import * as pragueLoader from "@prague/container-loader";
// import { WebPlatformFactory } from "@prague/container-utils";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";

export class CodeLoader implements ICodeLoader {
    constructor(private factory: IChaincodeFactory) {
    }

    public async load(source: string): Promise<IChaincodeFactory> {
        return this.factory;
    }
}

const domain = "localhost:3000";
const routerlicious = `http://${domain}`;
const historian = "http://localhost:3001";
// const tenantId = "github";
// const secret = "0bea3f87c186991a69245a29dc3f61d2";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

async function initializeChaincode(document: pragueLoader.Container, pkg: string): Promise<void> {
    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}

/**
 * Loads a specific version (commit) of the collaborative object
 */
export async function start(id: string, path: string, factory: IChaincodeFactory): Promise<void> {
    const service = socketStorage.createDocumentService(routerlicious, historian);

    // const classicPlatform = new WebPlatformFactory(document.getElementById("content"));
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
        `prague://${domain}/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}/${path}`,
        { tokenProvider, user },
        service,
        codeLoader,
        { blockUpdateMarkers: true });

    const container = loaderDoc.value as Container;

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        await initializeChaincode(container, `@chaincode/shared-text`)
            .catch((error) => console.log("chaincode error", error));
    }

    document.addEventListener("keyup", (event) => {
        const keyName = event.key;
        if (event.ctrlKey && keyName === "s") {
            container.snapshot("Manual snapshot");
        }
    });
}

const documentId = window.location.search ? window.location.search.substr(1) : "test-document";
const documentPath = window.location.hash ? window.location.hash.substr(1) : "";
console.log(`Loading ${documentId}`);
start(documentId, documentPath, sharedText).catch((err) => console.error(err));
