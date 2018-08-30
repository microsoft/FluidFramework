import { Client } from "azure-event-hubs";
import { ICheckpointManager, IEventProcessor, PartitionContext } from ".";

export class PartitionPump {
    private recieverP: any = null;
    private messageQueue: any[] = [];
    private processing = false;
    private context: PartitionContext;

    public constructor(
        private eventProcessor: IEventProcessor,
        private client: Client,
        private consumerGroup: string,
        private partitionId: string,
        private checkpointManager: ICheckpointManager) {
        this.context = new PartitionContext(this.checkpointManager, this.partitionId);
    }

    /**
     * Starts the PartitionPump
     */
    public async start() {
        if (this.recieverP) {
            throw new Error("Pump has already been started");
        }

        const initialOffset = await this.context.getInitialOffsetAsync();
        console.log(`Initial partition${this.partitionId}@${initialOffset}`);
        const options = {
            startAfterOffset: initialOffset,
        };

        await this.eventProcessor.openAsync(this.context);

        this.recieverP = this.client.createReceiver(this.consumerGroup, this.partitionId, options)
            .then((receiver) => {
                receiver.on("errorReceived", (error) => {
                    console.log("PartitionPumpError", error);
                    this.eventProcessor.error(this.context, error);
                });

                receiver.on("message", (message) => {
                    this.messageQueue.push(message);
                    this.pump();
                });
            });
    }

    /**
     * Begins processing incoming event hub messages
     */
    private pump() {
        // If already processing allow the processing to complete to trigger another round
        if (this.processing) {
            return;
        }

        // Base case for when there are no more messages left to process
        if (this.messageQueue.length === 0) {
            this.processing = false;
            return;
        }

        // Finally begin processing the messages
        this.processing = true;
        this.context.setOffsetAndSequenceNumber(this.messageQueue[this.messageQueue.length - 1]);
        this.eventProcessor.processEvents(this.context, this.messageQueue)
            .then(() => {
                this.processing = false;
                this.pump();
            },
            (error) => {
                console.log(`Processing error ${JSON.stringify(error)}`);
            });
        this.messageQueue = [];
    }
}
