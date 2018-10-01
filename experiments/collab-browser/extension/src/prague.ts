import * as loader from "../../../../routerlicious/packages/loader";
import { WebLoader, WebPlatform } from "../../../../routerlicious/packages/loader-web";
import * as socketStorage from "../../../../routerlicious/packages/socket-storage";
import * as jwt from "jsonwebtoken";
import { componentSym } from "../../component/src/component"
import { IPlatform, IPlatformFactory } from "../../../../routerlicious/packages/runtime-definitions";

const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";

const documentServices = socketStorage.createDocumentService(routerlicious, historian);
const tokenService = new socketStorage.TokenService();

class PlatformFactory<T> implements IPlatformFactory {
    // Very much a temporary thing as we flesh out the platform interfaces
    private lastPlatform: WebPlatform;

    constructor(
        private readonly div: HTMLElement,
        private readonly componentResolver: (component: T) => void,
    ) {
    }

    public async create(): Promise<IPlatform> {
        if (this.div) {
            this.div.innerHTML = "";
        }
        this.lastPlatform = new WebPlatform(this.div);
        this.lastPlatform[componentSym] = this.componentResolver;
        return this.lastPlatform;
    }

    // Temporary measure to indicate the UI changed
    public update() {
        if (!this.lastPlatform) {
            return;
        }

        this.lastPlatform.emit("update");
    }
}

export const load = <T>(documentId: string) => {
    const token = jwt.sign({
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: `browser-${(Math.random() * 0xFFFFFFFF) >>> 0}`,
            },
        },
        secret);

    const webLoader = new WebLoader("http://localhost:4873");

    let factory: IPlatformFactory;
    const componentP = new Promise<T>((resolver) => {
        factory = new PlatformFactory<T>(undefined, resolver);
    });

    loader.load(
        token,
        null,
        factory,
        documentServices,
        webLoader,
        tokenService,
        null,
        true);

    return componentP;
}

export const loadNotebook = async (documentId: string) => {
    const token = jwt.sign({
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: `browser-${(Math.random() * 0xFFFFFFFF) >>> 0}`,
            },
        },
        secret);

    const webLoader = new WebLoader("http://localhost:4873");

    const factory = new PlatformFactory<any>(null, () => { /* do nothing */ });

    const document = await loader.load(
        token,
        null,
        factory,
        documentServices,
        webLoader,
        tokenService,
        null,
        true);

    const platform = await new Promise<IPlatform>(resolver => {
        document.once("runtimeChanged", (runtime) => {
            resolver(runtime.platform);
        });
    });
    
    return platform.queryInterface("notebook") as any;
}