import * as kafka from "kafka-node";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import { TakeANumber } from "./takeANumber";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const mongoUrl = nconf.get("mongo:endpoint");
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("deli:kafkaClientId");
const receiveTopic = nconf.get("deli:topics:receive");
const sendTopic = nconf.get("deli:topics:send");
const CheckpointBatchSize = nconf.get("deli:checkpointBatchSize");

// Connection to stored document details
const client = MongoClient.connect(mongoUrl);
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
const objectsCollectionP = client.then((db) => db.collection(objectsCollectionName));

let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);
let producer = new kafka.Producer(kafkaClient, { partitionerType: 3 });
let producerReady = new Promise<void>((resolve, reject) => {
    producer.on("ready", () => {
        kafkaClient.refreshMetadata([sendTopic], (error, data) => {
            if (error) {
                console.error(error);
                return reject();
            }

            return resolve();
        });
    });
});

producer.on("error", (error) => {
    console.error("ERROR CONNECTEING TO KAFKA");
    console.error(error);
});

const dispensers: { [key: string]: TakeANumber } = {};

producerReady.then(
    () => {
        const groupId = nconf.get("deli:groupId");
        const consumerGroup = new kafka.ConsumerGroup({
                autoCommit: false,
                fromOffset: "earliest",
                groupId,
                host: zookeeperEndpoint,
                id: kafkaClientId,
                protocol: ["roundrobin"],
            },
            [receiveTopic]);
        const consumerOffset = new kafka.Offset(kafkaClient);
        consumerGroup.on("message", async (message: any) => {
            const value = JSON.parse(message.value);
            const objectId = value.objectId;

            // Go grab the takeANumber machine for the objectId and mark it as dirty
            if (!(objectId in dispensers)) {
                const collection = await objectsCollectionP;
                dispensers[objectId] = new TakeANumber(objectId, collection, producer, sendTopic);
            }
            const dispenser = dispensers[objectId];

            await dispenser.ticket(message);
            // Periodically checkpoints to mongo and checkpoints offset back to kafka.
            if (message.offset % CheckpointBatchSize === 0) {
                await dispenser.checkpoint();
                consumerOffset.commit(groupId,
                    [{ topic: message.topic, partition: message.partition, offset: message.offset }],
                    (error, data) => {
                            if (error) {
                                console.error(`Error checkpointing kafka offset: ${error}`);
                            } else {
                                console.log(`Success checkpointing kafka offset: ${message.offset}`);
                            }
                    });
            }
        });
    },
    (error) => {
        console.error(error);
    });
