import { EventData, EventProcessorHost, PartitionContext } from "@azure/event-processor-host";
import { IConsumer, IKafkaMessage, IPartition } from "@prague/services-core";
import { EventEmitter } from "events";

export class EventHubConsumer implements IConsumer {
    private events = new EventEmitter();
    private eventHost: EventProcessorHost;
    private partitions = new Set<string>();

    constructor(
        endpoint: string,
        clientId: string,
        public groupId: string,
        public topic: string,
        autoCommit: boolean,
        storageEndpoint: string,
        storageContainerName: string,
    ) {
        // Create the Event Processo Host
        this.eventHost = EventProcessorHost.createFromConnectionString(
            clientId,
            storageEndpoint,
            storageContainerName,
            endpoint,
            {
                consumerGroup: groupId,
            });

        this.eventHost.start(
            (context, data) => this.handleMessage(context, data),
            (error) => this.error(error));
    }

    public async commitOffset(data: any[]): Promise<void> {
        // const commitP = this.consumer.commitOffset([{ offset, partition: this.id }]);
        // TODO handle checkpointing
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public close(): Promise<void> {
        return this.eventHost.stop();
    }

    public pause() {
        this.eventHost.stop();
    }

    public resume() {
        throw new Error("Is this used?");
    }

    private getPartitions(partitionIds: string[]): IPartition[] {
        const partitions = partitionIds.map((id) => {
            const partition: IPartition = {
                offset: 0,
                partition: parseInt(id, 10),
                topic: this.topic,
            };
            return partition;
        });

        return partitions;
    }

    private updatePartitions() {
        let changed = false;
        for (const partition of this.eventHost.receivingFromPartitions) {
            if (!this.partitions.has(partition)) {
                changed = true;
                break;
            }
        }

        if (!changed) {
            return;
        }

        const existing = this.getPartitions(Array.from(this.partitions));
        this.events.emit("rebalancing", existing);
        const newPartitions = this.getPartitions(this.eventHost.receivingFromPartitions);
        this.events.emit("rebalanced", newPartitions);

        this.partitions.clear();
        for (const partition of this.eventHost.receivingFromPartitions) {
            this.partitions.add(partition);
        }
    }

    private handleMessage(context: PartitionContext, data: EventData) {
        this.updatePartitions();

        const kafkaMessage: IKafkaMessage = {
            highWaterOffset: data.sequenceNumber,
            key: data.partitionKey,
            offset: data.sequenceNumber,
            partition: parseInt(context.partitionId, 10),
            topic: context.eventhubPath,
            value: data.body,
        };

        this.events.emit("data", kafkaMessage);

        // TODO handle checkpointing
        context.checkpoint();
    }

    private error(error) {
        this.events.emit("error", error);
    }
}
