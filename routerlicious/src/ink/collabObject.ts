import * as _ from "lodash";
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

const snapshotFileName = "value";

export class InkCollaborativeObject extends api.CollaborativeObject implements IInk {
    // The current ink snapshot
    private inkSnapshot: Snapshot;

    constructor(
        document: api.Document,
        id: string,
        services?: api.IDistributedObjectServices,
        version?: string,
        header?: string) {

        const snapshot: IInkSnapshot = services && header
            ? JSON.parse(header)
            : { minimumSequenceNumber: 0, sequenceNumber: 0, snapshot: { layers: [], layerIndex: {} } };

        super(document, id, InkExtension.Type, snapshot.sequenceNumber, snapshot.minimumSequenceNumber, services);

        this.inkSnapshot = Snapshot.Clone(snapshot.snapshot);
    }

    public snapshot(): Promise<api.IObject[]> {
        const snapshot: IInkSnapshot = {
            minimumSequenceNumber: this.minimumSequenceNumber,
            sequenceNumber: this.sequenceNumber,
            snapshot: _.clone(this.inkSnapshot),
        };

        return Promise.resolve([{ path: snapshotFileName, data: snapshot}]);
    }

    public getLayers(): IInkLayer[] {
        return this.inkSnapshot.layers;
    }

    public getLayer(key: string): IInkLayer {
        return this.inkSnapshot.layers[this.inkSnapshot.layerIndex[key]];
    }

    public submitOp(op: IDelta) {
        this.processLocalOperation(op);
    }

    protected processCore(op: IDelta) {
        this.inkSnapshot.apply(op);
    }
}
