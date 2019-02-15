import { Block, BoxState } from "@prague/app-ui";
import { getChaincodeRepo, getDefaultCredentials, getDefaultDocumentService } from "@prague/client-api";
import { IPlatform, IPlatformFactory } from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { WebLoader, WebPlatform } from "@prague/loader-web";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { TokenProvider } from "@prague/socket-storage";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import { FlowViewContext } from "./flowViewContext";

const containerSym = Symbol("Document.container");
const platformSym = Symbol("Document.platform");

export async function proposeChaincode(document: Container, chaincode: string) {
    if (!document.connected) {
        // tslint:disable-next-line:no-unnecessary-callback-wrapper
        await new Promise<void>((resolve) => document.once("connected", () => resolve()));
    }

    await document.getQuorum().propose("code2", chaincode);
}

class DefinitionGuide extends EventEmitter {
    private dts: string = "";
    private components = new Map<string, { root: { entry: any, type: string }, dts: string }>();
    private value: any;

    constructor() {
        super();
    }

    public getDefinition(): string {
        return this.dts;
    }

    public getValue(): any {
        return this.value;
    }

    public async addComponent(id: string, platform: IPlatform) {
        const rootP = platform ? platform.queryInterface("root") : Promise.resolve(null);
        const dtsP = platform ? platform.queryInterface("dts") : Promise.resolve(null);
        const [root, dts] = await Promise.all([rootP, dtsP]);
        const details: any = { root, dts };

        this.components.set(id, details);
        this.generateDts();
    }

    private generateDts() {
        let dts = "";
        const value = {} as any;

        for (const component of this.components) {
            if (component[1].dts) {
                dts += component[1].dts;
                dts += "\n";
            }
        }

        dts += "declare interface IComponents {\n";
        for (const component of this.components) {
            const type = component[1].root ? component[1].root.type : "any";
            dts += `    ${component[0]}: ${type}\n`;
            value[component[0]] = component[1].root ? component[1].root.entry : null;
        }
        dts += "}\n";
        dts += "declare var host: IComponents\n";

        this.dts = dts;
        this.value = value;

        this.emit("definitionsChanged");
    }
}

const definitionGuide = new DefinitionGuide();

export class DocumentState extends BoxState {
    public id: string;
    public chaincode?: string;
    public [containerSym]: Container;
    public [platformSym]: PlatformFactory;
}

export class Platform extends WebPlatform implements IPlatform {
    constructor(div: HTMLElement, private readonly invalidateLayout: (width, height) => void) {
        super(div);
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "root":
                return { entry: definitionGuide.getValue(), type: "IComponents" };
            case "dts":
                return definitionGuide;
            case "invalidateLayout":
                return this.invalidateLayout;
            default:
                return super.queryInterface(id);
        }
    }

    public detach() {
        return;
    }
}

async function attach(loader: Loader, url: string, factory: PlatformFactory) {
    const response = await loader.request({ url });

    if (response.status !== 200) {
        return;
    }

    switch (response.mimeType) {
        case "prague/component":
            const component = response.value as IComponentRuntime;
            const platform = await factory.create();
            const componentPlatform = await component.attach(platform);
            // query the runtime for its definition - if it exists
            definitionGuide.addComponent(component.id, componentPlatform);
            break;
    }
}

async function registerAttach(loader: Loader, container: Container, uri: string, platform: PlatformFactory) {
    attach(loader, uri, platform);
    container.on("contextChanged", (value) => {
        attach(loader, uri, platform);
    });
}

export class PlatformFactory implements IPlatformFactory {
    // Very much a temporary thing as we flesh out the platform interfaces
    private lastPlatform: Platform;

    constructor(
        private readonly div: HTMLElement,
        private readonly invalidateLayout: (width: number, height: number) => void,
    ) {
    }

    public async create(): Promise<IPlatform> {
        if (this.div) {
            // tslint:disable-next-line:no-inner-html using to clear the list of children
            this.div.innerHTML = "";
        }
        this.lastPlatform = new Platform(this.div, this.invalidateLayout);
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

export class Document extends Block<DocumentState> {
    // TODO taking a dependency on the loader, loader-web, and socket-storage is not something we want to do.
    // This component needs access to the core abstract loader defined in runtime-definitions
    // but we need to update the API to provide it access and include the necessary methods.
    // We cut some corners below to start experimenting with dynamic document loading.
    protected mounting(self: DocumentState, context: FlowViewContext): HTMLElement {
        console.log(`Mount value is ${self.id}`);

        // Create the div to which the Chart will attach the SVG rendered chart when the
        // web service responds.
        const div = document.createElement("div");
        div.style.width = "400px";
        div.style.height = "600px";

        const openDoc = document.createElement("a");
        openDoc.href = `/loader/${encodeURIComponent(self.id)}`;
        openDoc.target = "_blank";
        openDoc.innerText = self.id;
        openDoc.style.display = "block";
        openDoc.style.width = "100%";
        openDoc.classList.add("component-link");

        const mountDiv = document.createElement("div");
        mountDiv.classList.add("mount-point");
        mountDiv.style.flexWrap = "wrap";
        mountDiv.appendChild(openDoc);
        mountDiv.appendChild(div);

        // TODO also something that shouldn't be direclty exposed
        const credentials = getDefaultCredentials();
        const token = jwt.sign(
            {
                documentId: self.id,
                permission: "read:write",
                tenantId: credentials.tenant,
                user: { id: "loader-client" },
            },
            credentials.key) as string;
        const tokenProvider = new TokenProvider(token);

        const webLoader = new WebLoader(getChaincodeRepo());

        const invalidateLayout = (width: number, height: number) => {
            div.style.width = `${width}px`;
            div.style.height = `${height}px`;
            context.services.get("invalidateLayout")();
        };

        const loader = new Loader(
            { tokenProvider },
            getDefaultDocumentService(),
            webLoader,
            { blockUpdateMarkers: true });
        const url =
            `prague://${document.location.host}/` +
            `${encodeURIComponent(credentials.tenant)}/${encodeURIComponent(self.id)}`;

        const platformFactory = new PlatformFactory(div, invalidateLayout);
        const containerP = loader.resolve({ url });
        containerP.then(
            (container) => {
                self[containerSym] = container;
                self[platformSym] = platformFactory;
                console.log("Document loaded");

                if (self.chaincode) {
                    proposeChaincode(container, self.chaincode).catch(
                        (error) => {
                            console.error("Error installing chaincode");
                        });
                }

                registerAttach(loader, container, url, platformFactory);
            },
            (error) => console.error("Failed to load document"));

        // Call 'updating' to update the contents of the div with the updated chart.
        return this.updating(self, context, mountDiv);
    }

    protected unmounting(self: BoxState, context: FlowViewContext, element: HTMLElement): void {
        // NYI: FlowView currently does not unmount components as they are removed.
    }

    protected updating(self: DocumentState, context: FlowViewContext, element: HTMLElement): HTMLElement {
        if (self[platformSym]) {
            self[platformSym].update();
        }

        return element;
    }
}
