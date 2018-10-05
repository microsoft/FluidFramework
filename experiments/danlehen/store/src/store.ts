import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import { ICollaborativeObjectExtension } from "../../../../routerlicious/packages/api-definitions";
import * as loader from "../../../../routerlicious/packages/loader";
import { WebLoader, WebPlatformFactory } from "../../../../routerlicious/packages/loader-web";
import { IChaincode, IPlatform, IRuntime, IDocumentService, ICodeLoader } from "../../../../routerlicious/packages/runtime-definitions";
import * as socketStorage from "../../../../routerlicious/packages/socket-storage";
import { Component } from "./component";

// Internal/reusable IChaincode implementation returned by Store.instantiate().
class Chaincode<T extends Component> extends EventEmitter implements IChaincode {
    // Maps the given type id to the factory for that type of collaborative object.
    private readonly typeToFactory: Map<string, ICollaborativeObjectExtension>;

    constructor(
        collaborativeTypes: ReadonlyArray<[string, ICollaborativeObjectExtension]>,
        private readonly component: T,
    ) {
        super();
        this.typeToFactory = new Map(collaborativeTypes);
    }

    // Returns the CollaborativeObject factory for the given type id.
    public getModule(type: string): any { return this.typeToFactory.get(type) || console.assert(false); }

    // NYI?
    public close() { return Promise.resolve(); }

    public async run(runtime: IRuntime, platform: IPlatform) {
        console.log("chaincode.run");
        const platformOut = new Platform<T>();
        this.component.open(runtime, platform).then(platformOut.resolveComponent);
        return platformOut;
    }
}

// Internal/resuable IPlatform implementation returned by IChainCode.run(..)
class Platform<TComponent> extends EventEmitter implements IPlatform {
    // IChainLoader.run(..) will invoke to resolve 'componentP' once Component.open(..) completes
    // loading the component.
    public readonly resolveComponent: (document: TComponent) => void;

    // Returned via 'queryInterface()' to Store.open(..) to return the constructed component
    // via the loader doc's 'runtimeChanged' event.
    private readonly componentP: Promise<TComponent>;

    constructor() {
        super();

        let capturedResolver;
        this.componentP = new Promise<TComponent>((resolver) => { capturedResolver = resolver; });
        this.resolveComponent = capturedResolver;
    }

    public queryInterface<T>(id: string): Promise<T> {
        console.assert(id === "component");
        console.log("QI");

        return this.componentP as any;
    }
}

interface StoreConfig {
    documentServices: IDocumentService,
    key: string,
    loader: ICodeLoader,
    tenantId: string,
    tokenService: socketStorage.TokenService,
}

/** Instance of a Prague store, required to open, create, or instantiate components. */
export class Store {
    private readonly config: Promise<StoreConfig>;

    constructor(hostUrl: string,
        private readonly collaborativeTypes: ReadonlyArray<[string, ICollaborativeObjectExtension]>)
    {
        this.config = this.getConfig(hostUrl);
    }

    // Given the 'hostUrl' of a routerlicious server (e.g., "http://localhost:3000"),
    // discovers the necessary config/services to open the store.
    private async getConfig(hostUrl: string) {
        const result = await new Promise<{
            blobStorageUrl: string,
            id: string,
            key: string,
            npm: string,
        }>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("GET", `${hostUrl}/api/tenants`, true);
            xhr.onload = () => {
                if (xhr.readyState === 4) {
                    if (xhr.status === 200) {
                        resolve(JSON.parse(xhr.responseText));
                    } else {
                        reject(xhr.statusText);
                    }
                }
            };
            xhr.onerror = () => { reject(xhr.statusText); };
            xhr.send(null);
        });

        // TODO: Dynamically sniff web vs. node loader?
        const webLoader = new WebLoader(result.npm);
        const documentServices = socketStorage.createDocumentService(hostUrl, result.blobStorageUrl);
        const tokenService = new socketStorage.TokenService();

        return {
            documentServices,
            key: result.key,
            loader: webLoader,
            tenantId: result.id,
            tokenService,
        };
    }

    public async auth(tenantId: string, userId: string, documentId: string) {
        return jwt.sign({
            documentId,
            permission: "read:write",       // use "read:write" for now
            tenantId,
            user: {
                id: userId,
            },
        },
        (await this.config).key);
    }

    public async open<T>(documentId: string, userId: string): Promise<T> {
        console.log("store.open");
        const config = await this.config;
        const token = await this.auth(config.tenantId, userId, documentId);
        const factory = new WebPlatformFactory(document.body);

        const loaderDoc = await loader.load(
            token,
            null,
            factory,
            config.documentServices,
            config.loader,
            config.tokenService,
            null,
            true);

        // Wait for the "runtimeChanged" event to deliver the IPlatform returned from ChainCode run().
        const platform = await new Promise<IPlatform>((resolver) => {
            loaderDoc.once("runtimeChanged", (runtime) => {
                resolver(runtime.platform);
            });
        });

        return platform.queryInterface("component") as Promise<T>;
    }

    public instantiate<T extends IPlatform>(component: Component) {
        console.log("store.instantiate");
        return new Chaincode(this.collaborativeTypes, component);
    }
}
