import { Block, BoxState } from "@prague/app-ui";
import { getChaincodeRepo, getDefaultCredentials, getDefaultDocumentService } from "@prague/client-api";
import * as loader from "@prague/loader";
import { proposeChaincode, WebLoader, WebPlatform } from "@prague/loader-web";
import { IPlatform, IPlatformFactory, IRuntime, IUser } from "@prague/runtime-definitions";
import { TokenProvider } from "@prague/socket-storage";
import { EventEmitter } from "events";
import * as jwt from "jsonwebtoken";
import { FlowViewContext } from "./flowViewContext";

const documentSym = Symbol("Document.document");
const platformSym = Symbol("Document.platform");

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

    public async addComponent(id: string, runtime: IRuntime) {
        const rootP = runtime.platform.queryInterface("root");
        const dtsP = runtime.platform.queryInterface("dts");
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
    public [documentSym]: loader.Document;
    public [platformSym]: PlatformFactory;
}

export class Platform extends WebPlatform {
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

        // TODO also something that shouldn't be direclty exposed
        const credentials = getDefaultCredentials();
        const user: IUser = { id: "loader-client" };
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

        const platformFactory = new PlatformFactory(div, invalidateLayout);

        const documentP = loader.load(
            self.id,
            credentials.tenant,
            user,
            tokenProvider,
            { blockUpdateMarkers: true },
            platformFactory,
            getDefaultDocumentService(),
            webLoader,
            null,
            true);
        documentP.then(
            (document) => {
                self[documentSym] = document;
                self[platformSym] = platformFactory;
                console.log("Document loaded");

                if (self.chaincode) {
                    proposeChaincode(document, self.chaincode).catch(
                        (error) => {
                            console.error("Error installing chaincode");
                        });
                }

                // query the runtime for its definition - if it exists
                definitionGuide.addComponent(self.id, document.runtime);
                document.on("runtimeChanged", (runtime) => {
                    definitionGuide.addComponent(self.id, document.runtime);
                });
            },
            (error) => console.error("Failed to load document"));

        // Call 'updating' to update the contents of the div with the updated chart.
        return this.updating(self, context, div);
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
