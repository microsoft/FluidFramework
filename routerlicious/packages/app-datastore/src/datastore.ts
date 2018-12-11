import * as loader from "@prague/loader";
import { WebLoader } from "@prague/loader-web";
import {
    ICodeLoader,
    IDocumentService,
    IPlatform,
    IPlatformFactory,
    IRuntime,
} from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import { debug } from "./debug";

// Internal IPlatform implementation used to pass the host services provided to
// DataStore.open() to the component instance.
class HostPlatform extends EventEmitter implements IPlatform {
    private readonly services: Map<string, Promise<any>>;

    constructor(services?: ReadonlyArray<[string, Promise<any>]>) {
        super();
        this.services = new Map(services);
    }

    public queryInterface<T>(id: string): Promise<T> {
        const service = this.services.get(id) as (Promise<T> | undefined);
        return service || Promise.reject(`Unknown id: ${id}`);
    }
}

// Internal IPlatformFactory instance used by DataStore.open() to bootstrap the above
// IPlatform implementation.
class HostPlatformFactory implements IPlatformFactory {
    constructor(private readonly services?: ReadonlyArray<[string, Promise<any>]>) { }

    public async create(): Promise<IPlatform> {
        return new HostPlatform(this.services);
    }
}

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
    public static async From(hostUrl: string) {
        // Given the 'hostUrl' of a routerlicious server (e.g., ), discovers
        // the necessary config/services to open the data store.
        const response = await fetch(`${hostUrl}/api/tenants`);
        const config = (await response.json()) as {
            blobStorageUrl: string;
            id: string;
            key: string;
            npm: string;
        };

        return new DataStore(
            new WebLoader(config.npm),
            socketStorage.createDocumentService(hostUrl, config.blobStorageUrl),
            config.key,
            config.id,
        );
    }

    constructor(
        private readonly codeLoader: ICodeLoader,
        private readonly documentService: IDocumentService,
        private readonly key: string,
        private readonly tenantId: string) { }

    /**
     * Open or create a component instance.
     *
     * @param componentId Identity of the component.
     * @param userId Identity of the user.
     * @param chaincodePackage Identity of the chaincode package to use, if creating the component.
     * @param services Services to provided by the caller to the component.
     */
    public async open<T>(
        componentId: string, userId: string,
        chaincodePackage: string,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ): Promise<T> {
        debug(`DataStore.open("${componentId}", "${userId}", "${chaincodePackage}")`);
        const token = await this.auth(this.key, this.tenantId, userId, componentId);
        const factory = new HostPlatformFactory(services);

        const loaderDoc = await loader.load(
            componentId,
            this.tenantId,
            {id: userId},
            new socketStorage.TokenProvider(token),
            null,
            factory,
            this.documentService,
            this.codeLoader,
            undefined,
            true);

        if (!loaderDoc.existing) {
            debug(`  not existing`);

            // Wait for connection so that proposals can be sent
            if (!loaderDoc.connected) {
                await new Promise<void>((resolve) => loaderDoc.once("connected", resolve));
            }

            debug(`  now connected`);

            // And then make the proposal if a code proposal has not yet been made
            const quorum = loaderDoc.getQuorum();
            if (!quorum.has("code")) {
                debug(`  prosposing code`);
                await quorum.propose("code", chaincodePackage);
            }

            debug(`   code is ${quorum.get("code")}`);
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

    private async auth(key: string, tenantId: string, userId: string, documentId: string) {
        return jwt.sign({
                documentId,
                permission: "read:write",       // use "read:write" for now
                tenantId,
                user: {
                    id: userId,
                },
            },
            key);
    }
}
