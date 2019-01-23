import { Block, BoxState } from "@prague/app-ui";
import { Document } from "@prague/client-api";
import { WebPlatform } from "@prague/loader-web";
import {
    IChannel,
    IDeltaManager,
    IDistributedObjectServices,
    IGenericBlob,
    IPlatform,
    IQuorum,
    IRuntime,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { FlowViewContext } from "./flowViewContext";

/**
 * Simple aproximation of the true inner component runtime. In general many of these calls need to be better isolated
 * from the host context and have an easier to find affinity to the component.
 */
class InnerRuntime extends EventEmitter implements IRuntime {
    public get tenantId(): string {
        return this.runtime.tenantId;
    }

    public get id(): string {
        return this.runtime.id;
    }

    public get existing(): boolean {
        return this.runtime.existing;
    }
    // public readonly options: any;
    public get options(): any {
        return this.runtime.options;
    }

    public get clientId(): string {
        return this.runtime.clientId;
    }

    public get user(): IUser {
        return this.runtime.user;
    }

    public get parentBranch(): string {
        return this.runtime.parentBranch;
    }

    public get connected(): boolean {
        return this.runtime.connected;
    }

    public get deltaManager(): IDeltaManager {
        return this.runtime.deltaManager;
    }

    constructor(private componentId: string, private runtime: IRuntime, public readonly platform: IPlatform) {
        super();
    }

    public getChannel(id: string): Promise<IChannel> {
        return this.runtime.getChannel(this.getInnerComponentId(id));
    }

    public createChannel(id: string, type: string): IChannel {
        return this.runtime.createChannel(this.getInnerComponentId(id), type);
    }

    public attachChannel(channel: IChannel): IDistributedObjectServices {
        return this.runtime.attachChannel(channel);
    }

    public getQuorum(): IQuorum {
        return this.runtime.getQuorum();
    }

    public snapshot(message: string): Promise<void> {
        return this.runtime.snapshot(message);
    }

    public save(message: string) {
        return this.runtime.save(message);
    }

    public close(): void {
        return;
    }

    public hasUnackedOps(): boolean {
        return this.runtime.hasUnackedOps();
    }

    public uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        return this.runtime.uploadBlob(file);
    }

    public getBlob(sha: string): Promise<IGenericBlob> {
        return this.runtime.getBlob(sha);
    }

    public getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.runtime.getBlobMetadata();
    }

    public submitMessage(type: MessageType, content: any) {
        return this.runtime.submitMessage(type, content);
    }

    private getInnerComponentId(id: string): string {
        return `${this.componentId}-${id}`;
    }
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

const platformSym = Symbol("Document.platform");

export class InnerDocumentState extends BoxState {
    public id: string;
    public chaincode?: string;
    public [platformSym]: InnerPlatform;
}

export class InnerPlatform extends WebPlatform {
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

    public update() {
        this.emit("update");
    }
}

export class InnerComponent extends Block<InnerDocumentState> {
    // TODO taking a dependency on the loader, loader-web, and socket-storage is not something we want to do.
    // This component needs access to the core abstract loader defined in runtime-definitions
    // but we need to update the API to provide it access and include the necessary methods.
    // We cut some corners below to start experimenting with dynamic document loading.
    protected mounting(self: InnerDocumentState, context: FlowViewContext): HTMLElement {
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

        const invalidateLayout = (width: number, height: number) => {
            div.style.width = `${width}px`;
            div.style.height = `${height}px`;
            context.services.get("invalidateLayout")();
        };

        const collabDocument = context.services.get("document") as Document;

        const innerComponentP = this.loadInnerComponent(
            self.id,
            collabDocument.runtime,
            div,
            invalidateLayout);
        innerComponentP.then(
            (document) => {
                self[platformSym] = document.platform;
                console.log("Document loaded");

                // query the runtime for its definition - if it exists
                definitionGuide.addComponent(self.id, document.runtime);
            },
            (error) => console.error("Failed to load document"));

        // Call 'updating' to update the contents of the div with the updated chart.
        return this.updating(self, context, mountDiv);
    }

    protected unmounting(self: BoxState, context: FlowViewContext, element: HTMLElement): void {
        // NYI: FlowView currently does not unmount components as they are removed.
    }

    protected updating(self: InnerDocumentState, context: FlowViewContext, element: HTMLElement): HTMLElement {
        if (self[platformSym]) {
            self[platformSym].update();
        }

        return element;
    }

    private async loadInnerComponent(
        id: string,
        hostRuntime: IRuntime,
        div: HTMLDivElement,
        invalidate: (width: number, height: number) => void,
    ): Promise<{ platform: InnerPlatform, runtime: IRuntime }> {
        // Temporary measure - doing a require of pinpoint-editor only when needed since it does browser specific
        // imports of css, etc...
        const pp = require("@prague/pinpoint-editor");
        const cc = await pp.instantiate();

        // stops the chaincode from running
        // cc.close();

        // retrieves a previously stored module type
        // To begin with I can probably just have the base loader do this and proxy all other stuff
        // const type: string = "";
        // cc.getModule(type);

        // Runs the chaincode itself
        const platform = new InnerPlatform(div, invalidate);
        const runtime = new InnerRuntime(id, hostRuntime, platform);

        await cc.run(runtime, platform);

        // * The runtime will have been used to create things that
        //   I'll then call getModule with. I should just fake this for now.
        // * The platform is the host the thing is running on. I can use the same host as I previously had
        return { platform, runtime };
    }
}
