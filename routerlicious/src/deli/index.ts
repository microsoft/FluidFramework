import { Client, Sender } from "azure-event-hubs";
import { Collection, MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as eventProcessor from "../event-processor";
import * as utils from "../utils";
import { TakeANumber } from "./takeANumber";

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
    private dispensers: { [key: string]: TakeANumber } = {};

    // A map of dispensers that have recently ticketed a message and require serializing the generated sequence number
    private dirtyDispensers: { [key: string]: TakeANumber } = {};

    constructor(private senderP: Promise<Sender>, private objectsCollectionP: Promise<Collection>) {
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
        const dependencies = await Promise.all([this.senderP, this.objectsCollectionP]);
        const sender = dependencies[0];
        const collection = dependencies[1];

        console.log(`Processing ${messages.length} events`);
        const messageProcessed: Array<Promise<any>> = [];
        for (const message of messages) {
            // tslint:disable-next-line
            console.log(`Received message on partition ${context.partitionId} with key ${message.partitionKey} at offset ${message.offset}`);
            let processedP = this.processEvent(
                sender,
                collection,
                context,
                message);
            messageProcessed.push(processedP);
        }

        // Wait for all the messages to finish processing. Then have the ticketing machines checkpoint. And finally
        // checkpoint the event hub. The ordering here matters since once we checkpoint the event hub we won't
        // return to process the messages
        await Promise.all(messageProcessed);
        await this.checkpointDispensers();
        await context.checkpoint();
    }

    public async error(context: eventProcessor.PartitionContext, error: any): Promise<void> {
        console.error(`EventProcessor error: ${JSON.stringify(error)}`);
    }

    /**
     * Checkpoints all the pending dispensers
     */
    private async checkpointDispensers(): Promise<any> {
        console.log("Checkpointing dispensers...");
        const checkpointsP: Array<Promise<void>> = [];

        // tslint:disable-next-line:forin
        for (const key in this.dirtyDispensers) {
            const dispenser = this.dispensers[key];
            const checkpointP = dispenser.checkpoint();
            checkpointsP.push(checkpointP);
        }

        return Promise.all(checkpointsP);
    }

    private async processEvent(
        sender: Sender,
        collection: Collection,
        context: eventProcessor.PartitionContext,
        message: any): Promise<void> {

        const objectId = message.body.objectid;

        // Go grab the takeANumber machine for the objectId and mark it as dirty
        if (!(objectId in this.dispensers)) {
            this.dispensers[objectId] = new TakeANumber(objectId, collection, sender);
        }
        const dispenser = this.dispensers[objectId];
        this.dirtyDispensers[objectId] = dispenser;

        return dispenser.ticket(message);
    }
}

class EventProcessorFactory implements eventProcessor.IEventProcessorFactory {
    private senderP: Promise<Sender>;
    private objectsCollectionP: Promise<Collection>;

    constructor() {
        // Configure access to the event hub where we'll send sequenced packets
        const deltasConfig = nconf.get("eventHub:deltas");
        const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.send);
        const sendClient = Client.fromConnectionString(deltasConnectionString, deltasConfig.entityPath);
        this.senderP = sendClient.open().then(() => sendClient.createSender());

        // Connection to stored document details
        const client = MongoClient.connect(mongoUrl);
        const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
        this.objectsCollectionP = client.then((db) => db.collection(objectsCollectionName));
    }

    public createEventProcessor(context: any): eventProcessor.IEventProcessor {
        return new EventProcessor(this.senderP, this.objectsCollectionP);
    }
};

const host = new eventProcessor.EventProcessorHost(
    rawDeltasConfig.entityPath,
    consumerGroup,
    rawDeltasConnectionString,
    mongoCheckpointManager);
host.registerEventProcessorFactory(new EventProcessorFactory());
