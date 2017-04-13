import * as amqp from "amqplib";
import * as Bluebird from "bluebird";
import * as nconf from "nconf";
import * as path from "path";
import * as eventProcessor from "../event-processor";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Go grab the connection string to the queue system
const snapshotQueue = nconf.get("tmz:queue");
const rabbitmqConnectionString = nconf.get("rabbitmq:connectionString");

// Get the event hub connection string information
const deltasConfig = nconf.get("eventHub:deltas");
const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.listen);
const consumerGroup = nconf.get("tmz:consumerGroup");

// The checkpoint manager stores the current location inside of the event hub
const mongoUrl = nconf.get("mongo:endpoint");
const partitionsCollectionName = nconf.get("mongo:collectionNames:partitions");
const mongoCheckpointManager = new eventProcessor.MongoCheckpointManager(
    mongoUrl,
    partitionsCollectionName,
    deltasConfig.entityPath,
    consumerGroup);

class EventProcessor implements eventProcessor.IEventProcessor {
    private createdRequests: any = {};

    constructor(private channelP: Bluebird<amqp.Channel>, private queue: string) {
    }

    public async openAsync(context: eventProcessor.PartitionContext): Promise<void> {
        console.log("opening event processor");
        const channel = await this.channelP;
        await channel.assertQueue(this.queue, { durable: true });
    }

    public async closeAsync(
        context: eventProcessor.PartitionContext,
        reason: eventProcessor.CloseReason): Promise<void> {
        console.log("closing event processor");
    }

    public async processEvents(context: eventProcessor.PartitionContext, messages: any[]): Promise<void> {
        console.log(`Processing ${messages.length} events`);
        const messageProcessed: Array<Promise<any>> = [];
        for (const message of messages) {
            let processedP = this.processEvent(message.body as socketStorage.IRoutedOpMessage);
            messageProcessed.push(processedP);
        }

        console.log(`Checkpointing ${messages.length} messages`);
        await Promise.all(messageProcessed);
        await context.checkpoint();
    }

    public async error(context: eventProcessor.PartitionContext, error: any): Promise<void> {
        console.error(`EventProcessor error: ${JSON.stringify(error)}`);
    }

    private async processEvent(message: socketStorage.IRoutedOpMessage): Promise<void> {
        if (this.createdRequests[message.objectId]) {
            console.log(`Already requested snapshots for ${message.objectId}`);
            return;
        }

        this.createdRequests[message.objectId] = true;
        console.log(`Requesting snapshots for ${message.objectId}`);

        const channel = await this.channelP;
        channel.sendToQueue(this.queue, new Buffer(message.objectId))
    }
}

class EventProcessorFactory implements eventProcessor.IEventProcessorFactory {
    private channelP: Bluebird<amqp.Channel>;

    constructor(connectionString: string, private snapshotQueue: string) {
        const connectionP = amqp.connect(connectionString);
        this.channelP = connectionP.then((connection) => connection.createChannel());
    }

    public createEventProcessor(context: any): eventProcessor.IEventProcessor {
        return new EventProcessor(this.channelP, this.snapshotQueue);
    }
};

const host = new eventProcessor.EventProcessorHost(
    deltasConfig.entityPath,
    consumerGroup,
    deltasConnectionString,
    mongoCheckpointManager);
host.registerEventProcessorFactory(new EventProcessorFactory(rabbitmqConnectionString, snapshotQueue));
