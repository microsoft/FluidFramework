import { Checkpoint, ICheckpointManager, StartOfStream } from ".";

export class PartitionContext {
    public offset: string;
    public sequenceNumber: number;

    constructor(private checkpointManager: ICheckpointManager, public partitionId: string) {
    }

    public setOffsetAndSequenceNumber(eventData) {
        if (eventData == null) {
            throw new Error("invalid argument");
        }

        this.offset = eventData.offset;
        this.sequenceNumber = eventData.sequenceNumber;
    }

    public async getInitialOffsetAsync(): Promise<string> {
        const checkpoint = await this.checkpointManager.getCheckpoint(this.partitionId);

        if (checkpoint === null || !checkpoint.offset) {
            this.offset = StartOfStream;
            this.sequenceNumber = 0;
        } else {
            this.offset = checkpoint.offset;
            this.sequenceNumber = checkpoint.sequenceNumber;
        }

        return this.offset;
    }

    /**
     * Writes the current offset and sequenceNumber to the checkpoint store via the checkpoint manager.
     */
    public checkpoint(): Promise<void> {
        const capturedCheckpoint = new Checkpoint(this.partitionId, this.offset, this.sequenceNumber);

        return this.persistCheckpoint(capturedCheckpoint);
    }

    /**
     * Stores the offset and sequenceNumber from the provided received EventData instance, then writes those
     * values to the checkpoint store via the checkpoint manager.
     */
    public async Checkpoint(eventData): Promise<void> {
        if (eventData == null) {
            throw new Error("invalid argument");
        }

        // We have never seen this sequence number yet
        if (eventData.sequenceNumber > this.sequenceNumber) {
            throw new Error("eventData.SystemProperties.SequenceNumber");
        }

        return this.persistCheckpoint(
            new Checkpoint(
                this.partitionId, eventData.offset, eventData.sequenceNumber));
    }

    private async persistCheckpoint(checkpoint: Checkpoint): Promise<void> {
        return this.checkpointManager.updateCheckpoint(checkpoint);
    }
}
