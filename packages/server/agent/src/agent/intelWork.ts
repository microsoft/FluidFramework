import {
    IDocumentServiceFactory,
    IHost,
} from "@prague/container-definitions";
import { TextAnalyzer } from "@prague/intelligence-runner";
import { ISharedMap, SharedMap } from "@prague/map";
import * as Sequence from "@prague/sequence";
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
            // This is a patch up for our legacy stuff when both agents uses the same map key to populate results.
            // To play nice with back-compat, intel runner creates the map and translator waits on the key.
            if (!insightsMap.has(sharedString.id)) {
                const insightSlot = SharedMap.create(this.document.runtime);
                insightsMap.set(sharedString.id, insightSlot);
                const textAnalyzer = new TextAnalyzer();
                textAnalyzer.run(sharedString, insightsMap);
            }
        }
    }

    public async stop(): Promise<void> {
        await super.stop();
    }
}
