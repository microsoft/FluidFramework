import { Collection, MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as eventProcessor from "../event-processor";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Initialize Socket.io and connect to the Redis adapter
let redisConfig = nconf.get("redis");
let io = socketIoEmitter(({ host: redisConfig.host, port: redisConfig.port }));
io.redis.on("error", (error) => {
    console.error(error);
});

// Configure access to the event hub where we'll send sequenced packets
const deltasConfig = nconf.get("eventHub:deltas");
const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.listen);
const consumerGroup = nconf.get("scriptorium:consumerGroup");

// Connect to the database
const mongoUrl = nconf.get("mongo:endpoint");

// The checkpoint manager stores the current location inside of the event hub
const partitionsCollectionName = nconf.get("mongo:collectionNames:partitions");
const mongoCheckpointManager = new eventProcessor.MongoCheckpointManager(
    mongoUrl,
    partitionsCollectionName,
    deltasConfig.entityPath,
    consumerGroup);

class EventProcessor implements eventProcessor.IEventProcessor {
    constructor(private collectionP: Promise<Collection>) {
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
        const collection = await this.collectionP;

        console.log(`Processing ${messages.length} events`);
        const messageProcessed: Array<Promise<any>> = [];
        for (const message of messages) {
            let processedP = this.processEvent(collection, message.body as socketStorage.IRoutedOpMessage);
            messageProcessed.push(processedP);
        }

        console.log(`Checkpointing ${messages.length} messages`);
        await Promise.all(messageProcessed);
        await context.checkpoint();
    }

    public async error(context: eventProcessor.PartitionContext, error: any): Promise<void> {
        console.error(`EventProcessor error: ${JSON.stringify(error)}`);
    }

    private async processEvent(collection: Collection, message: socketStorage.IRoutedOpMessage): Promise<void> {
        // Serialize the message to backing store
        console.log(`Inserting to mongodb`);
        await collection.insert(message);

        // Route the message to clients
        console.log(`Routing message to clients`);
        io.to(message.objectId).emit("op", message);
    }
}

class EventProcessorFactory implements eventProcessor.IEventProcessorFactory {
    private collectionP: Promise<Collection>;

    constructor() {
        const mongoClientP = MongoClient.connect(mongoUrl);
        this.collectionP = mongoClientP.then(async (db) => {
            const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");
            const collection = db.collection(deltasCollectionName);

            // TODO remove once we've stabalized
            await collection.drop();

            const indexP = collection.createIndex({
                    objectId: 1,
                    sequenceNumber: 1,
                },
                { unique: true });

            await indexP;
            return collection;
        });
    }

    public createEventProcessor(context: any): eventProcessor.IEventProcessor {
        return new EventProcessor(this.collectionP);
    }
};

// Initialize the event processor to begin pulling messages from the event hub
const eventProcessorHost = new eventProcessor.EventProcessorHost(
    deltasConfig.entityPath,
    consumerGroup,
    deltasConnectionString,
    mongoCheckpointManager);
eventProcessorHost.registerEventProcessorFactory(new EventProcessorFactory());
