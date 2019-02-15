import { ICodeLoader, IDocumentService, IPlatform } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { WebLoader } from "@prague/loader-web";
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
     * @param usedId The ID of the user (e.g., "anonymous-coward")
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
     * @param chaincodePackage Identity of the chaincode package to use, if creating the component.
     * @param path Route to the desired subcomponent (use "" to retrieve the root component).
     * @param services Services to provided by the caller to the component.
     */
    public async open<T>(
        componentId: string,
        chaincodePackage: string,
        path: string,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ): Promise<T> {
        debug(`DataStore.open("${componentId}", "${chaincodePackage}")`);

        const tokenProvider = new TokenProvider(this.auth(componentId));
        const loader = new Loader(
            { tokenProvider },
            this.documentService,
            this.codeLoader,
            { blockUpdateMarkers: true });

        const baseUrl =
            // tslint:disable-next-line:max-line-length
            `prague://${document.location.host}/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(componentId)}`;
        debug(`resolving baseUrl = ${baseUrl}`);
        const container = await loader.resolve({ url: baseUrl });
        debug(`resolved baseUrl = ${baseUrl}`);

        const platformIn = new HostPlatform(services);
        debug(`attaching baseUrl = ${baseUrl}`);

        let acceptPlatformOut: (value: IPlatform) => void;
        // tslint:disable-next-line:promise-must-complete
        const platformOut = new Promise<IPlatform>((accept) => { acceptPlatformOut = accept; });

        await registerAttach(
            loader,
            container,
            `${baseUrl}/${path}`,
            platformIn,
            acceptPlatformOut);
        debug(`attached baseUrl = ${baseUrl}`);

        // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
        // package.
        if (!container.existing) {
            debug("initializing chaincode");
            await initializeChaincode(container, chaincodePackage)
                .catch((error) => { console.assert(false, `chaincode error: ${error}`); });
            debug("chaincode initialized");
        }

        // Return the constructed/loaded component.  We retrieve this via queryInterface on the
        // IPlatform created by ChainCode.run().
        return (await platformOut).queryInterface("component");
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
        await new Promise<void>((resolve) => document.on("connected", () => { resolve(); }));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    debug(`Code is ${quorum.get("code2")}`);
}

async function attach(
    loader: Loader,
    url: string,
    platformIn: HostPlatform,
    platformOut: (out: IPlatform) => void,
) {
    debug(`loader.request(url=${url})`);
    const response = await loader.request({ url });

    if (response.status !== 200) {
        debug(`Error: loader.request(url=${url}) -> ${response.status}`);
        return;
    }

    const mimeType = response.mimeType;
    switch (mimeType) {
        case "prague/component":
            debug(`loader.request(url=${url}) -> ${mimeType}`);
            const component = response.value as IComponentRuntime;
            platformOut(await component.attach(platformIn));
            break;
        default:
            debug(`loader.request(url=${url}) -> Unhandled mimeType ${mimeType}`);
    }
}

async function registerAttach(
    loader: Loader,
    container: Container,
    uri: string,
    platformIn: HostPlatform,
    platformOut: (out: IPlatform) => void,
) {
    container.on("contextChanged", async () => {
        debug(`contextChanged uri=${uri}`);
        await attach(loader, uri, platformIn, platformOut);
    });
    await attach(loader, uri, platformIn, platformOut);
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
