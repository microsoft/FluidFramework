import {
    IDocumentServiceFactory,
    IHost,
} from "@prague/container-definitions";
import * as Intelligence from "@prague/intelligence-runner";
import { ISharedMap, MapExtension } from "@prague/map";
import * as Sequence from "@prague/sequence";
import * as uuid from "uuid/v4";
import { BaseWork} from "./baseWork";
import { IWork} from "./definitions";

export class IntelWork extends BaseWork implements IWork {

    constructor(
        alfred: string,
        docId: string,
        tenantId: string,
        host: IHost,
        config: any,
        private serviceFactory: IDocumentServiceFactory) {
        super(alfred, docId, tenantId, host, config);
    }

    public async start(task: string): Promise<void> {
        await this.loadDocument(
            { localMinSeq: 0, encrypted: undefined, client: { type: "intel"} },
            this.serviceFactory,
            task);

        // Wait for the document to get fully connected.
        if (!this.document.isConnected) {
            await new Promise<void>((resolve) => this.document.on("connected", () => resolve()));
        }

        const rootMap = this.document.getRoot();
        const sharedString = rootMap.get("text") as Sequence.SharedString;
        const insightsMap = rootMap.get("insights") as ISharedMap;

        if (sharedString && insightsMap) {
            // This is a patchup for our legacy stuff when both agents uses the same map key to populate results.
            // To play nice with back-compat, intel runner creates the map and translator waits on the key.
            if (!insightsMap.has(sharedString.id)) {
                const insightSlot = this.document.runtime.createChannel(uuid(), MapExtension.Type);
                insightsMap.set(sharedString.id, insightSlot);
                Intelligence.run(sharedString, insightsMap);
            }
        }
    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
