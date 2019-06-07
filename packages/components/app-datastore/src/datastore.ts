import {
    ICodeLoader,
    IDocumentServiceFactory,
    IPlatform,
    IPragueResolvedUrl,
    IRequest,
    IResolvedUrl,
    ITokenClaims,
    IUrlResolver,
} from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { WebLoader } from "@prague/loader-web";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { IComponent } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import { debug } from "./debug";

// tslint:disable-next-line:no-typeof-undefined
const URL: Window["URL"] = typeof window === "undefined"
    // tslint:disable:no-unsafe-any
    // tslint:disable:no-implicit-dependencies
    // tslint:disable:no-var-requires
    // tslint:disable:no-require-imports
    ? require("url").URL
    : window.URL;
    // tslint:enable:no-implicit-dependencies
    // tslint:enable:no-var-requires
    // tslint:enable:no-require-imports
    // tslint:enable:no-unsafe-any

class InsecureUrlResolver implements IUrlResolver {
    constructor(
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly user: string,
        private readonly key: string,
    ) { }

    public async resolve(request: IRequest): Promise<IResolvedUrl> {
        debug(`resolving url=${JSON.stringify(request)}`);

        // tslint:disable-next-line:no-http-string - Replacing protocol so URL will parse.
        const parsedUrl = new URL(request.url.replace(/^prague:\/\//, "http://"));
        const [tenantId, documentId, ...pathParts] = parsedUrl.pathname.substr(1).split("/");
        let path = pathParts.join("/");
        if (path.length > 0) {
            path = `/${encodeURIComponent(path)}`;
        }

        const documentUrl = `prague://${new URL(this.ordererUrl).host}` +
            `/${encodeURIComponent(tenantId)}` +
            `/${encodeURIComponent(documentId)}` +
            `${path}`;

        const deltaStorageUrl =
            `${this.ordererUrl}/deltas/${encodeURIComponent(tenantId)}/${encodeURIComponent(documentId)}`;

        const storageUrl = `${this.storageUrl}/repos/${encodeURIComponent(tenantId)}`;

        // tslint:disable-next-line:no-unnecessary-local-variable
        const response: IPragueResolvedUrl = {
            endpoints: {
                deltaStorageUrl,
                ordererUrl: this.ordererUrl,
                storageUrl,
            },
            tokens: { jwt: this.auth(tenantId, documentId) },
            type: "prague",
            url: documentUrl,
        };

        return response;
    }

    private auth(tenantId: string, documentId: string) {
        const claims: ITokenClaims = {
            documentId,
            permission: "read:write",
            tenantId,
            user: { id: this.user },
        };

        return jwt.sign(claims, this.key);
    }
}

/**
 * Instance of a Prague data store, used to open/create component instances.
 *
 * @deprecated This class is deprecated. Please use vanilla-loader instead
 */
export class DataStore {
    /**
     * Given the 'hostUrl' of a routerlicious service, returns a Prague data store that can
     * open, create, and instantiate components from that server.
     *
     * @param hostUrl - The url of the routerlicious service to (e.g., "http://localhost:3000")
     * @param usedId - The ID of the user (e.g., "anonymous-coward")
     */
    // tslint:disable-next-line:no-reserved-keywords
    public static async from(hostUrl: string, userId: string, codeLoader?: ICodeLoader) {
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
            hostUrl,
            config.blobStorageUrl,
            codeLoader || new WebLoader(config.npm),
            new RouterliciousDocumentServiceFactory(),
            config.key,
            config.id,
            userId,
        );
    }

    constructor(
        private readonly ordererUrl: string,
        private readonly storageUrl: string,
        private readonly codeLoader: ICodeLoader,
        private readonly documentServiceFactory: IDocumentServiceFactory,
        private readonly key: string,
        private readonly tenantId: string,
        private readonly userId: string,
    ) { }

    /**
     * Open or create a component instance.
     *
     * @param componentId - Identity of the component.
     * @param chaincodePackage - Identity of the chaincode package to use, if creating the component.
     * @param path - Route to the desired subcomponent (use "" to retrieve the root component).
     * @param services - Services to provided by the caller to the component.
     */
    public async open<T>(
        componentId: string,
        chaincodePackage: string,
        path: string,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ): Promise<T> {
        debug(`DataStore.open("${componentId}", "${chaincodePackage}")`);

        const resolver = new InsecureUrlResolver(
            this.ordererUrl,
            this.storageUrl,
            this.userId,
            this.key);

        const loader = new Loader(
            { resolver },
            this.documentServiceFactory,
            this.codeLoader,
            { blockUpdateMarkers: true });
        const baseUrl =
            // tslint:disable-next-line:max-line-length
            `${this.ordererUrl.replace(/^[^:]+/, "prague")}/${encodeURIComponent(this.tenantId)}/${encodeURIComponent(componentId)}`;
        const url = `${baseUrl}${
                // Ensure '/' separator when concatenating 'baseUrl' and 'path'.
                (path && path.charAt(0)) !== "/" ? "/" : ""
            }${path}`;

        debug(`resolving baseUrl = ${baseUrl}`);
        const container = await loader.resolve({ url: baseUrl });
        debug(`resolved baseUrl = ${baseUrl}`);

        const platformIn = new HostPlatform(services);

        let acceptResultOut: (value: T) => void;
        // tslint:disable-next-line:promise-must-complete
        const resultOut = new Promise<T>((accept) => { acceptResultOut = accept; });

        debug(`attaching url = ${url}`);
        container.on("contextChanged", async () => {
            debug(`contextChanged url=${url}`);
            await attach(loader, url, platformIn, acceptResultOut);
        });
        await attach(loader, url, platformIn, acceptResultOut);
        debug(`attached url = ${url}`);

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
        return resultOut;
    }
}

async function initializeChaincode(container: Container, pkg: string): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = container.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!container.connected) {
        await new Promise<void>((resolve) => container.on("connected", () => { resolve(); }));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    debug(`Code is ${quorum.get("code2")}`);
}

async function attach<T>(
    loader: Loader,
    url: string,
    platformIn: HostPlatform,
    resultOut: (out: T) => void,
) {
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
            const componentRuntime = response.value as IComponent;
            const platformOut = await componentRuntime.attach(platformIn);
            resultOut(await platformOut.queryInterface("component"));
            break;
        case "prague/dataType":
            resultOut(response.value as T);
            break;
        default:
            debug(`Unhandled mimeType ${mimeType}`);
    }
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
