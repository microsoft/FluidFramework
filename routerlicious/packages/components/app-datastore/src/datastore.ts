import { SharedObject } from "@prague/api-definitions";
import { ICodeLoader, IDocumentService, IPlatform } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { WebLoader } from "@prague/loader-web";
import { IMapView, ISharedMap } from "@prague/map";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { createDocumentService, TokenProvider } from "@prague/socket-storage";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import { debug } from "./debug";

/**
 * Instance of a Prague data store, used to open/create component instances.
 */
export class DataStore {
    /**
     * Given the 'hostUrl' of a routerlicious service, returns a Prague data store that can
     * open, create, and instantiate components from that server.
     *
     * @param hostUrl The url of the routerlicious service to (e.g., "http://localhost:3000")
     */
    // tslint:disable-next-line:no-reserved-keywords
    public static async from(hostUrl: string, userId: string) {
        // Routerlicious currently exposes it's configuration parameters as a JSON file at "<serverUrl>/api/tenants".
        const url = new URL(hostUrl);
        url.pathname = "/api/tenants";

        const response = await fetch(url.toString());
        const config = (await response.json()) as {
            blobStorageUrl: string;
            id: string;
            key: string;
            npm: string;
        };

        return new DataStore(
            new WebLoader(config.npm),
            createDocumentService(hostUrl, config.blobStorageUrl),
            config.key,
            config.id,
            userId,
        );
    }

    constructor(
        private readonly codeLoader: ICodeLoader,
        private readonly documentService: IDocumentService,
        private readonly key: string,
        private readonly tenantId: string,
        private readonly userId: string,
    ) { }

    /**
     * Open or create a component instance.
     *
     * @param componentId Identity of the component.
     * @param userId Identity of the user.
     * @param chaincodePackage Identity of the chaincode package to use, if creating the component.
     * @param services Services to provided by the caller to the component.
     */
    public async open<T>(
        componentId: string,
        chaincodePackage: string,
        path: string,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ): Promise<T> {
        debug(`DataStore.open("${componentId}", "${chaincodePackage}")`);

        await start(
            this.auth(componentId),
            this.tenantId,
            componentId,
            "",
            chaincodePackage,
            this.codeLoader,
            this.documentService,
            services);

        // Return the constructed/loaded component.  We retrieve this via queryInterface on the
        // IPlatform created by ChainCode.run().  This arrives via the "runtimeChanged" event on
        // the loaderDoc.
        // return new Promise<T>((resolver) => {
        //     loaderDoc.once("runtimeChanged", (runtime: IRuntime) => {
        //         resolver(runtime.platform.queryInterface("component"));
        //     });
        // });

        return null;
    }

    private auth(documentId: string) {
        return jwt.sign({
                documentId,
                permission: "read:write",       // use "read:write" for now
                tenantId: this.tenantId,
                user: {
                    id: this.userId,
                },
            },
            this.key);
    }
}

async function initializeChaincode(document: Container, pkg: string): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        await new Promise<void>((resolve) => document.on("connected", (clientId: string) => { resolve(); }));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}

// This demo code does not belong in DataStore.
function renderMap(view: IMapView, div: HTMLElement) {
    // tslint:disable-next-line:no-inner-html using to clear contents
    div.innerHTML = "";

    const dl = document.createElement("dl");
    view.forEach((value, key: string) => {
        const dt = document.createElement("dt");
        const dd = document.createElement("dd");
        dt.innerText = key;

        if (value instanceof SharedObject) {
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

async function attach(loader: Loader, url: string, platform: HostPlatform) {
    debug(`loader.request(url=${url})`);
    const response = await loader.request({ url });

    if (response.status !== 200) {
        debug(`Error: loader.request(url=${url}) -> ${response.status}`);
        return;
    }

    const mimeType = response.mimeType;
    debug(`loader.request(url=${url}) -> ${mimeType}`);
    switch (mimeType) {
        case "prague/component":
            const component = response.value as IComponentRuntime;
            await component.attach(platform);
            break;
        case "prague/dataType":
            const dataType = response.value as ISharedMap;
            const view = await dataType.getView();
            const div = await platform.queryInterface<HTMLElement>("div");
            renderMap(view, div);
            dataType.on("valueChanged", (key) => { renderMap(view, div); });
            break;
        default:
            throw new Error(`Unhandled mimeType ${mimeType}`);
    }
}

async function registerAttach(loader: Loader, container: Container, uri: string, platform: HostPlatform) {
    container.on("contextChanged", async (value) => {
        debug(`contextChanged uri=${uri}`);
        await attach(loader, uri, platform);
    });
    await attach(loader, uri, platform);
}

class HostPlatform extends EventEmitter implements IPlatform {
    private readonly services: Map<string, Promise<any>>;

    constructor(services?: ReadonlyArray<[string, Promise<any>]>) {
        super();
        this.services = new Map(services);
    }

    public queryInterface<T>(id: string): Promise<T> {
        debug(`HostPlatform.queryInterface(${id})`);
        const service = this.services.get(id) as (Promise<T> | undefined);
        return service || Promise.reject(`Unknown id: ${id}`);
    }

    public async detach() {
        debug(`HostPlatform.detach()`);
        return;
    }
}

async function start(
    token: string,
    tenantId: string,
    documentId: string,
    path: string,
    code: string,
    codeLoader: ICodeLoader,
    documentService: IDocumentService,
    services: ReadonlyArray<[string, Promise<any>]>,
): Promise<void> {
    const tokenProvider = new TokenProvider(token);
    const loader = new Loader(
        { tokenProvider },
        documentService,
        codeLoader,
        { blockUpdateMarkers: true });

    const baseUrl =
        `prague://${document.location.host}/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;
    debug(`resolving baseUrl = ${baseUrl}`);
    const container = await loader.resolve({ url: baseUrl });
    debug(`resolved baseUrl = ${baseUrl}`);

    const platform = new HostPlatform(services);
    debug(`attaching baseUrl = ${baseUrl}`);
    await registerAttach(
        loader,
        container,
        `${baseUrl}/${path}`,
        platform);
    debug(`attached baseUrl = ${baseUrl}`);

    // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
    if (!container.existing) {
        debug("initializing chaincode");
        await initializeChaincode(container, code)
            .catch((error) => { console.assert(false, `chaincode error: ${error}`); });
        debug("chaincode initialized");
    }
}
