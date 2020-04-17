/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { EventData, EventProcessorHost, PartitionContext, FromTokenProviderOptions } from "@azure/event-processor-host";
import {
    BoxcarType,
    IBoxcarMessage,
    IConsumer,
    IQueuedMessage,
    IPartition,
} from "@microsoft/fluid-server-services-core";
import { debug } from "./debug";

interface IEventHubMessage extends IQueuedMessage {
    context: PartitionContext;
    data: EventData;
}

export class EventHubConsumer implements IConsumer {
    private readonly events = new EventEmitter();
    private readonly eventHost: EventProcessorHost;
    private readonly partitions = new Set<string>();

    constructor(
        endpoint: string,
        clientId: string,
        public readonly groupId: string,
        public readonly topic: string,
        storageEndpoint: string,
        storageContainerName: string,
        additionalOptions?: FromTokenProviderOptions,
    ) {
        // Create the Event Processor Host
        this.eventHost = EventProcessorHost.createFromConnectionString(
            clientId,
            storageEndpoint,
            `${storageContainerName}-${groupId}`,
            endpoint,
            {
                consumerGroup: groupId,
                eventHubPath: topic,
                ...additionalOptions,
            });

        this.eventHost.start(
            (context, data) => this.handleMessage(context, data),
            (error) => this.handleError(error))
            .then(() => this.events.emit("connected"),
                (error) => this.handleError(error));
    }

    public async commitCheckpoint(partitionId: number, queuedMessage: IQueuedMessage): Promise<void> {
        const eventHubMessage = queuedMessage as IEventHubMessage;
        if (eventHubMessage && eventHubMessage.context && eventHubMessage.data) {
            await eventHubMessage.context.checkpointFromEventData(eventHubMessage.data);
        } else {
            debug("Invalid message metadata");
        }
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public async close() {
        await this.eventHost.stop();
    }

    public async pause() {
        await this.eventHost.stop();
    }

    public async resume() {
        throw new Error("Not implemented");
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
        const receivingFromPartitions = this.eventHost.receivingFromPartitions;

        let changed = receivingFromPartitions.length !== this.partitions.size;
        if (!changed) {
            for (const partition of receivingFromPartitions) {
                if (!this.partitions.has(partition)) {
                    changed = true;
                    break;
                }
            }
        }

        if (!changed) {
            return;
        }

        const existing = this.getPartitions(Array.from(this.partitions));
        this.events.emit("rebalancing", existing);
        const newPartitions = this.getPartitions(receivingFromPartitions);
        this.events.emit("rebalanced", newPartitions);

        this.partitions.clear();
        for (const partition of receivingFromPartitions) {
            this.partitions.add(partition);
        }
    }

    private handleMessage(context: PartitionContext, data: EventData) {
        this.updatePartitions();

        const boxcarMessage: IBoxcarMessage = {
            contents: [data.body],
            documentId: data.body.documentId,
            tenantId: data.body.tenantId,
            type: BoxcarType,
        };

        const eventHubMessage: IEventHubMessage = {
            context,
            data,
            offset: data.sequenceNumber,
            partition: parseInt(context.partitionId, 10),
            topic: context.eventhubPath,
            value: boxcarMessage,
        };

        this.events.emit("data", eventHubMessage);
    }

    private handleError(error) {
        this.events.emit("error", error);
    }
}
