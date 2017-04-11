import { Client } from "azure-event-hubs";
import { ICheckpointManager, IEventProcessorFactory } from ".";
import { PartitionPump } from "./partitionPump";

export class PartitionManager {
    private running = false;
    private pumps: { [key: string]: PartitionPump } = {};

    constructor(
        private path,
        private consumerGroup: string,
        private connectionString: string,
        private checkpointManager: ICheckpointManager,
        private factory: IEventProcessorFactory) {
    }

    public async start() {
        if (this.running) {
            throw new Error("PartitionManager has already been started");
        }

        this.running = true;

        // Validate the checkpoint store is ready and available
        await this.checkpointManager.createCheckpointStoreIfNotExists();

        // And then begin creating partition pumps
        const client = Client.fromConnectionString(this.connectionString, this.path);
        client.open().then(() => {
            client.getPartitionIds().then((ids) => {
                for (const id of ids) {
                    const eventProcessor = this.factory.createEventProcessor(null);
                    const pump = new PartitionPump(
                        eventProcessor,
                        client,
                        this.consumerGroup,
                        id,
                        this.checkpointManager);

                    console.log(`Starting pump on partitino ${id}`);
                    pump.start();

                    this.pumps[id] = pump;
                }
            });
        });
    }
}
