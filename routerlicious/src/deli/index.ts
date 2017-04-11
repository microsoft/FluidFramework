import { Client, Sender } from "azure-event-hubs";
import * as nconf from "nconf";
import * as path from "path";
import * as eventProcessor from "../event-processor";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Get connection information to the event hub
const rawDeltasConfig = nconf.get("eventHub:raw-deltas");
const rawDeltasConnectionString = utils.getEventHubConnectionString(rawDeltasConfig.endpoint, rawDeltasConfig.listen);
const consumerGroup = nconf.get("deli:consumerGroup");

// The checkpoint manager stores the current location inside of the event hub
const mongoUrl = nconf.get("mongo:endpoint");
const partitionsCollectionName = nconf.get("mongo:collectionNames:partitions");
const mongoCheckpointManager = new eventProcessor.MongoCheckpointManager(
    mongoUrl,
    partitionsCollectionName,
    rawDeltasConfig.entityPath,
    consumerGroup);

class EventProcessor implements eventProcessor.IEventProcessor {
    private sequenceNumber = 0;

    constructor(private senderP: Promise<Sender>) {
    }

    public async openAsync(context: eventProcessor.PartitionContext): Promise<void> {
        console.log("opening event processor");
    }

    public async closeAsync(
        context: eventProcessor.PartitionContext,
        reason: eventProcessor.CloseReason): Promise<void> {
        console.log("closing event processor");
    }

    public async processEvents(context: eventProcessor.PartitionContext, messages: any[]): Promise<void> {
        const sender = await this.senderP;

        console.log(`Processing ${messages.length} events`);
        const messageProcessed: Array<Promise<any>> = [];
        for (const message of messages) {
            let processedP = this.processEvent(sender, context, message);
            messageProcessed.push(processedP);
        }

        console.log(`Checkpointing ${messages.length} messages`);
        await Promise.all(messageProcessed);
        await context.checkpoint();
    }

    public async error(context: eventProcessor.PartitionContext, error: any): Promise<void> {
        console.error(`EventProcessor error: ${JSON.stringify(error)}`);
    }

    private async processEvent(sender: Sender, context: eventProcessor.PartitionContext, message: any): Promise<void> {
        // tslint:disable-next-line
        console.log(`Received message on partition ${context.partitionId} with key ${message.partitionKey} at offset ${message.offset}`);
        const submitOpMessage = message.body as socketStorage.ISubmitOpMessage;
        const routedMessage: socketStorage.IRoutedOpMessage = {
            clientId: submitOpMessage.clientId,
            objectId: submitOpMessage.objectId,
            op: submitOpMessage.op,
            sequenceNumber: this.sequenceNumber++,
        };

        // Serialize the sequenced message to the event hub
        let promise = new Promise<any>((resolve, reject) => {
            sender.send(routedMessage, routedMessage.objectId).then(() => resolve(), (error) => reject(error));
        });

        return promise;
    }
}

class EventProcessorFactory implements eventProcessor.IEventProcessorFactory {
    private senderP: Promise<Sender>;

    constructor() {
        // Configure access to the event hub where we'll send sequenced packets
        const deltasConfig = nconf.get("eventHub:deltas");
        const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.send);
        const sendClient = Client.fromConnectionString(deltasConnectionString, deltasConfig.entityPath);
        this.senderP = sendClient.open().then(() => sendClient.createSender());
    }

    public createEventProcessor(context: any): eventProcessor.IEventProcessor {
        return new EventProcessor(this.senderP);
    }
};

const host = new eventProcessor.EventProcessorHost(
    rawDeltasConfig.entityPath,
    consumerGroup,
    rawDeltasConnectionString,
    mongoCheckpointManager);
host.registerEventProcessorFactory(new EventProcessorFactory());
