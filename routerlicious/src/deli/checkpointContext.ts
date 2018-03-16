import * as winston from "winston";
import * as core from "../core";
import { IRangeTrackerSnapshot } from "../core-utils";
import { IContext } from "../kafka-service/lambdas";

export interface IClientSequenceNumber {
    // Whether or not the object can expire
    canEvict: boolean;
    clientId: string;
    lastUpdate: number;
    nack: boolean;
    referenceSequenceNumber: number;
}

export interface ICheckpoint {
    branchMap: IRangeTrackerSnapshot;
    clients: IClientSequenceNumber[];
    logOffset: number;
    sequenceNumber: number;
}

export class CheckpointContext {
    private pendingUpdateP: Promise<void>;
    private pendingCheckpoint: ICheckpoint;

    constructor(private id: string, private collection: core.ICollection<core.IDocument>, private context: IContext) {
    }

    public checkpoint(checkpoint: ICheckpoint) {
        // Check if a checkpoint is in progress - if so store the pending checkpoint
        if (this.pendingUpdateP) {
            this.pendingCheckpoint = checkpoint;
            return;
        }

        // Write the checkpoint data to MongoDB
        this.pendingUpdateP = this.checkpointCore(checkpoint);
        this.pendingUpdateP.then(
            () => {
                this.context.checkpoint(checkpoint.logOffset);
                this.pendingUpdateP = null;

                // Trigger another round if there is a pending update
                if (this.pendingCheckpoint) {
                    const pendingCheckpoint = this.pendingCheckpoint;
                    this.pendingCheckpoint = null;
                    this.checkpoint(pendingCheckpoint);
                }
            },
            (error) => {
                // TODO flag context as error
                winston.error("Error writing checkpoint to MongoDB", error);
            });
    }

    private checkpointCore(checkpoint: ICheckpoint) {
        const updateP = this.collection.update(
            {
                _id: this.id,
            },
            checkpoint,
            null);

        // Retry the checkpoint on error
        return updateP.catch((error) => {
            winston.error("Error writing checkpoint to MongoDB", error);
            return new Promise<void>((resolve, reject) => {
                resolve(this.checkpointCore(checkpoint));
            });
        });
    }
}
