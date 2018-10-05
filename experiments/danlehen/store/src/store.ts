import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import { ICollaborativeObjectExtension } from "../../../../routerlicious/packages/api-definitions";
import * as loader from "../../../../routerlicious/packages/loader";
import { WebLoader } from "../../../../routerlicious/packages/loader-web";
import { IMap } from "../../../../routerlicious/packages/map";
import {
    IChaincode,
    ICodeLoader,
    IDocumentService,
    IPlatform,
    IRuntime,
    IPlatformFactory,
} from "../../../../routerlicious/packages/runtime-definitions";
import * as socketStorage from "../../../../routerlicious/packages/socket-storage";
import { Component } from "./component";

// Internal/reusable IChaincode implementation returned by Store.instantiate().
class Chaincode<T extends Component> extends EventEmitter implements IChaincode {
    // Maps the given type id to the factory for that type of collaborative object.
    private readonly typeToFactory: Map<string, ICollaborativeObjectExtension>;

    constructor(
        private readonly component: T,
    ) {
        super();
        this.typeToFactory = new Map(component.collaborativeTypes);
    }

    // Returns the CollaborativeObject factory for the given type id.
    public getModule(type: string): any { return this.typeToFactory.get(type) || console.assert(false); }

    // NYI?
    public close() { return Promise.resolve(); }

    public async run(runtime: IRuntime, platform: IPlatform) {
        console.log("chaincode.run");
        const platformOut = new Platform<T>();
        this.component.open(runtime, platform).then(async (root: IMap) => {
            console.log("Component.opened");
            await this.component.opened(runtime, platform, await root.getView());

            console.log("Platform.resolveComponent");
            platformOut.resolveComponent(this.component);
        });

        return platformOut;
    }
}

// Internal/resuable IPlatform implementation returned by IChainCode.run(..)
class Platform<TComponent> extends EventEmitter implements IPlatform {
    // Function invoked by IChainLoader.run(..) to resolve 'componentP'.
    public readonly resolveComponent: (document: TComponent) => void;

    // 'queryInterface("component")' returns this promise.  Invoked by Store.open(..) to
    // retrieve the constructed component.
    private readonly componentP: Promise<TComponent>;

    constructor() {
        super();

        // 'any' to work around TS2454: TypeScript 3.0.1 does not believe 'capturedResolver' is initialized before use.
        let capturedResolver: any;
        this.componentP = new Promise<TComponent>((resolver) => { capturedResolver = resolver; });
        this.resolveComponent = capturedResolver;
    }

    public queryInterface<T>(id: string): Promise<T> {
        console.assert(id === "component");
        console.log("QI");

        // 'any' because it can not be statically proven that <T> and <TComponent> are compatible.
        return this.componentP as any;
    }
}

class HostPlatform extends EventEmitter implements IPlatform {
    private readonly services: Map<string, Promise<any>>;
    
    constructor (services?: ReadonlyArray<[string, Promise<any>]>) {
        super();
        this.services = new Map(services);
    }

    public queryInterface<T>(id: string): Promise<T> {
        return this.services.get(id) as Promise<T>;
    }
}

class HostPlatformFactory implements IPlatformFactory {
    constructor(private readonly services?: ReadonlyArray<[string, Promise<any>]>) { }

    public async create(): Promise<IPlatform> {
        return new HostPlatform(this.services);
    }
}

interface IStoreConfig {
    codeLoader: ICodeLoader;
    documentService: IDocumentService;
    key: string;
    tenantId: string;
    tokenService: socketStorage.TokenService;
}

/** Instance of a Prague store, required to open, create, or instantiate components. */
export class Store {
    public static instantiate<T extends IPlatform>(component: Component) {
        console.log(`store.instantiate(${component.constructor.name})`);
        return new Chaincode(component);
    }

    private readonly config: Promise<IStoreConfig>;

    constructor(hostUrl: string) {
        this.config = this.getConfig(hostUrl).then((config) => {
            return {
                codeLoader: new WebLoader(config.npm),
                documentService: socketStorage.createDocumentService(hostUrl, config.blobStorageUrl),
                key: config.key,
                tenantId: config.id,
                tokenService: new socketStorage.TokenService(),
            };
        });
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

    // TODO: Caller should provide host IPlatform to the document
    public async open<T>(documentId: string, userId: string, chaincodePackage: string, services?: ReadonlyArray<[string, Promise<any>]>): Promise<T> {
        console.log(`store.open("${documentId}", "${userId}", "${chaincodePackage}")`);
        const config = await this.config;
        const token = await this.auth(config.tenantId, userId, documentId);
        const factory = new HostPlatformFactory(services);

        const loaderDoc = await loader.load(
            token,
            null,
            factory,
            config.documentService,
            config.codeLoader,
            config.tokenService,
            undefined,
            true);

        if (!loaderDoc.existing) {
            console.log(`  not existing`);

            // Wait for connection so that proposals can be sent
            if (!loaderDoc.connected) {
                await new Promise<void>((resolve) => loaderDoc.once("connected", resolve));
            }

            console.log(`  now connected`);

            // And then make the proposal if a code proposal has not yet been made
            const quorum = loaderDoc.getQuorum();
            if (!quorum.has("code")) {
                console.log(`  prosposing code`);
                await quorum.propose("code", chaincodePackage);
            }

            console.log(`   code is ${quorum.get("code")}`);
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

    // Given the 'hostUrl' of a routerlicious server (e.g., "http://localhost:3000"), discovers the necessary
    // config/services to open the store.
    private async getConfig(hostUrl: string) {
        return await new Promise<{
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
            xhr.send();
        });
    }
}
