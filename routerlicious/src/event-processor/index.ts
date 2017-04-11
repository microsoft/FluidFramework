import { Checkpoint } from "./checkpoint";
import { PartitionContext } from "./partitionContext";
import { PartitionManager } from "./partitionManager";

export enum CloseReason {
    LeaseLost,
    Shutdown,
};

export const StartOfStream = "-1";

export interface IEventProcessor {
    /**
     * Called by processor host to initialize the event processor.
     */
    openAsync(context: PartitionContext): Promise<void>;

    /**
     * Called by processor host to indicate that the event processor is being stopped.
     */
    closeAsync(context: PartitionContext, reason: CloseReason): Promise<void>;

    /**
     * Called by the processor host when a batch of events has arrived.
     */
    processEvents(context: PartitionContext, messages: any[]): Promise<void>;

    /**
     * Called when the underlying client experiences an error while receiving. EventProcessorHost will take
     * care of recovering from the error and continuing to pump messages, so no action is required from
     * your code. This method is provided for informational purposes.
     */
    error(context: PartitionContext, error: any): Promise<void>;
}

export interface IEventProcessorFactory {
    createEventProcessor(context): IEventProcessor;
}

/**
 * Manages checkpoint information for an Event Hub
 */
export interface ICheckpointManager {
    createCheckpointStoreIfNotExists(): Promise<void>;

    getCheckpoint(partitionId: string ): Promise<Checkpoint>;

    updateCheckpoint(checkpoint: Checkpoint): Promise<void>;
}

export class EventProcessorHost {
    private partitionManager: PartitionManager;

    constructor(
        private path,
        private consumerGroup: string,
        private connectionString: string,
        private checkpointManager: ICheckpointManager) {
    }

    /**
     * This registers an IEventProcessor implementation with the host. This also starts the host and causes it to
     * start participating in the partition distribution process.
     */
    public registerEventProcessorFactory(factory: IEventProcessorFactory) {
        if (this.partitionManager) {
            throw new Error("registerEventProcessorFactory can only be called once");
        }

        this.partitionManager = new PartitionManager(
            this.path,
            this.consumerGroup,
            this.connectionString,
            this.checkpointManager,
            factory);
        this.partitionManager.start();
    }
}

export * from "./checkpoint";
export * from "./mongoCheckpointManager";
export * from "./partitionContext";
