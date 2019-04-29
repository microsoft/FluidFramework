import {
    Browser,
    ICodeLoader,
    IDocumentServiceFactory,
    IHost,
    IPlatform,
} from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { IComponent } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { parse } from "url";
import { debug } from "../debug";
import { IDocumentTaskInfo } from "../definitions";

export class ChaincodeWork extends EventEmitter {

    protected document: Container;

    private events = new EventEmitter();
    private task: string;

    constructor(
        private readonly alfred: string,
        private readonly docId: string,
        private readonly tenantId: string,
        private readonly host: IHost,
        private readonly serviceFactory: IDocumentServiceFactory,
        private readonly codeLoader: ICodeLoader,
        workType: string) {
            super();
            this.task = workType;
    }

    public async loadChaincode(options: any, attachPlatform: boolean): Promise<void> {
        const loader = new Loader(
            this.host,
            this.serviceFactory,
            this.codeLoader,
            options);

        const url =
            `prague://${parse(this.alfred).host}/` +
            `${encodeURIComponent(this.tenantId)}/${encodeURIComponent(this.docId)}`;
        this.document = await loader.resolve({ url });

        if (attachPlatform) {
            this.registerAttach(
                loader,
                this.document,
                url,
                new NodePlatform());
            this.attachListeners();
        }

        // Wait to be fully connected!
        if (!this.document.connected) {
            await new Promise<void>((resolve) => this.document.on("connected", () => resolve()));
        }
    }

    public async stop(): Promise<void> {
        // Make sure the document is loaded.
        if (this.document !== undefined) {
            // Remove all listeners and close the document.
            this.document.removeAllListeners();
            this.document.close();
            debug(`Closed document ${this.tenantId}/${this.docId} for task ${this.task}`);
        }
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListeners() {
        this.events.removeAllListeners();
        this.removeAllListeners();
    }

    private registerAttach(loader: Loader, container: Container, uri: string, platform: NodePlatform) {
        this.attach(loader, uri, platform);
        container.on("contextChanged", (value) => {
            this.attach(loader, uri, platform);
        });
    }

    private async attach(loader: Loader, url: string, platform: NodePlatform) {
        const response = await loader.request({ url });
        if (response.status !== 200) {
            return;
        }
        switch (response.mimeType) {
            case "prague/component":
                const component = response.value as IComponent;
                component.attach(platform);
                break;
        }
    }

    private attachListeners() {
        // Emits document relared errors to caller.
        const errorHandler = (error) => {
            this.events.emit("error", error);
        };
        this.document.on("error", errorHandler);

        const leaveHandler = (clientId: string) => {
            if (this.document.clientId === clientId) {
                this.requestStop();
            } else {
                if (this.noLeader()) {
                    this.requestStop();
                }
            }
        };
        this.document.getQuorum().on("removeMember", leaveHandler);
    }

    // Emits a stop request message to the caller. The caller will then
    // call stop() to stop the task on the document.
    private requestStop() {
        const stopEvent: IDocumentTaskInfo = {
            docId: this.docId,
            task: this.task,
            tenantId: this.tenantId,
        };
        this.events.emit("stop", stopEvent);
    }

    // A leader is any browser client connected to the document at this moment.
    // The leader election makes sure that the session has a leader as long as there is
    // a browser client connected.
    private noLeader(): boolean {
        for (const client of this.document.getQuorum().getMembers()) {
            if (!client[1].client || !client[1].client.type || client[1].client.type === Browser) {
                return false;
            }
        }
        return true;
    }
}

class NodePlatform extends EventEmitter implements IPlatform {
    public async queryInterface<T>(id: string): Promise<any> {
        return null;
    }

    public detach() {
        return;
    }
}
