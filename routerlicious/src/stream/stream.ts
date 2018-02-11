import * as resources from "gitresources";
import * as api from "../api-core";
import { IDelta, IInkLayer, IStream } from "../data-types";
import { CollaborativeMap } from "../map";
import { StreamExtension } from "./extension";
import { ISnapshot, Snapshot } from "./snapshot";

/**
 * Map snapshot definition
 */
export interface IInkSnapshot {
    minimumSequenceNumber: number;
    sequenceNumber: number;
    snapshot: ISnapshot;
};

const snapshotFileName = "header";

const emptySnapshot: ISnapshot = { layers: [], layerIndex: {} };

export class Stream extends CollaborativeMap implements IStream {
    // The current ink snapshot
    private inkSnapshot: Snapshot;

    constructor(
        document: api.IDocument,
        id: string,
        sequenceNumber: number,
        services?: api.IDistributedObjectServices,
        version?: resources.ICommit,
        header?: string) {

        super(id, document, StreamExtension.Type);
    }

    public getLayers(): IInkLayer[] {
        return this.inkSnapshot.layers;
    }

    public getLayer(key: string): IInkLayer {
        return this.inkSnapshot.layers[this.inkSnapshot.layerIndex[key]];
    }

    public submitOp(op: IDelta) {
        this.submitLocalMessage(op);
        this.inkSnapshot.apply(op);
    }

    protected loadContent(version: resources.ICommit, header: string) {
        const data: ISnapshot = header
            ? JSON.parse(Buffer.from(header, "base64").toString("utf-8"))
            : emptySnapshot;
        this.initialize(data);
    }

    protected initializeContent() {
        this.initialize(emptySnapshot);
    }

    protected snapshotContent(): api.ITree {
        const tree: api.ITree = {
            entries: [
                {
                    path: snapshotFileName,
                    type: api.TreeEntry[api.TreeEntry.Blob],
                    value: {
                        contents: JSON.stringify(this.inkSnapshot),
                        encoding: "utf-8",
                    },
                },
            ],
        };

        return tree;
    }

    protected processContent(message: api.ISequencedObjectMessage) {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            this.inkSnapshot.apply(message.contents as IDelta);
        }
    }

    private initialize(data: ISnapshot) {
        this.inkSnapshot = Snapshot.Clone(data);
    }
}
