import * as sharedText from "@chaincode/shared-text";
import { CollaborativeObject } from "@prague/api-definitions";
import { IChaincodeFactory, ICodeLoader } from "@prague/container-definitions";
import { Container } from "@prague/container-loader";
import { Loader } from "@prague/container-loader";
import { CollaborativeMap, IMapView } from "@prague/map";
import { IComponentRuntime, WebPlatform } from "@prague/runtime";
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

async function initializeChaincode(document: Container, pkg: string): Promise<void> {
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

function renderMap(view: IMapView) {
    const div = document.getElementById("content");
    div.innerHTML = "";

    const dl = document.createElement("dl");
    view.forEach((value, key) => {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.innerText = key;

        if (value instanceof CollaborativeObject) {
            dd.innerText = `${value.type}/${value.id}`;
        } else {
            try {
                dd.innerText = JSON.stringify(value);
            } catch {
                dd.innerText = "!Circular";
            }
        }

        dl.appendChild(dt).appendChild(dd);
    });

    div.appendChild(dl);
}

async function attach(loader: Loader, url: string, platform: LocalPlatform) {
    const response = await loader.request({ url });

    if (response.status !== 200) {
        return;
    }

    switch (response.mimeType) {
        case "prague/component":
            const component = response.value as IComponentRuntime;
            component.attach(platform);
            break;
        case "prague/dataType":
            const dataType = response.value as CollaborativeMap;
            const view = await dataType.getView();
            renderMap(view);
            dataType.on("valueChanged", (key) => renderMap(view));
            break;
    }
}

async function registerAttach(loader: Loader, container: Container, uri: string, platform: LocalPlatform) {
    attach(loader, uri, platform);
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

class LocalPlatform extends WebPlatform {
    constructor(div: HTMLElement) {
        super(div);
    }

    public async detach() {
        return;
    }
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

    const loader = new Loader(
        { tokenProvider, user },
        service,
        codeLoader,
        { blockUpdateMarkers: true });

    const container = await loader.resolve(
        { url: `prague://${domain}/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}` });

    const platform = new LocalPlatform(document.getElementById("content"));
    registerAttach(
        loader,
        container,
        `prague://${domain}/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}/${path}`,
        platform);

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
