import { core } from "../client-api";
import { BaseWork} from "./baseWork";
import { Serializer } from "./serializer";
import { IWork} from "./work";

export class SnapshotWork extends BaseWork implements IWork {
    constructor(docId: string, config: any, private service: core.IDocumentService) {
        super(docId, config);
    }

    public async start(): Promise<void> {
        await this.loadDocument({ encrypted: undefined, localMinSeq: 0 }, this.service);
        const serializer = new Serializer(this.document);
        const eventHandler = (op: core.ISequencedDocumentMessage) => {
            serializer.run(op);
        };
        this.operation = eventHandler;
        this.document.on("op", eventHandler);
        return Promise.resolve();
    }
}
