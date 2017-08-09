import * as api from "../api";
import { IDelta } from "./delta";
import { InkExtension } from "./extension";
import { IInkLayer, ISnapshot, Snapshot } from "./snapshot";

export interface IInk extends api.ICollaborativeObject {
    getLayers(): IInkLayer[];

    getLayer(key: string): IInkLayer;

    submitOp(op: IDelta);
}

/**
 * Map snapshot definition
 */
export interface IInkSnapshot {
    minimumSequenceNumber: number;
    sequenceNumber: number;
    snapshot: ISnapshot;
};

const snapshotFileName = "header";

export class InkCollaborativeObject extends api.CollaborativeObject implements IInk {
    // The current ink snapshot
    private inkSnapshot: Snapshot;

    constructor(
        document: api.Document,
        id: string,
        sequenceNumber: number,
        services?: api.IDistributedObjectServices,
        version?: string,
        header?: string) {
        super(document, id, InkExtension.Type, sequenceNumber, services);
        const data = header
            ? JSON.parse(Buffer.from(header, "base64").toString("utf-8"))
            : { layers: [], layerIndex: {} };

        this.inkSnapshot = Snapshot.Clone(data);
    }

    public snapshot(): api.ITree {
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

    public getLayers(): IInkLayer[] {
        return this.inkSnapshot.layers;
    }

    public getLayer(key: string): IInkLayer {
        return this.inkSnapshot.layers[this.inkSnapshot.layerIndex[key]];
    }

    public submitOp(op: IDelta) {
        this.submitLocalOperation(op);
        this.inkSnapshot.apply(op);
    }

    protected processCore(message: api.ISequencedObjectMessage) {
        if (message.type === api.OperationType && message.clientId !== this.document.clientId) {
            this.inkSnapshot.apply(message.contents as IDelta);
        }

        this.events.emit("op", message);
    }

    protected processMinSequenceNumberChanged(value: number) {
        // TODO need our own concept of the zamboni here
    }
}
