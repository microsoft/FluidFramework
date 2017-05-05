import * as kafka from "kafka-node";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as core from "../core";
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
const partitionMap: { [key: string]: string[] } = {};

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
            const value = JSON.parse(message.value) as core.IRawOperationMessage;
            const objectId = value.objectId;

            // Go grab the takeANumber machine for the objectId and mark it as dirty.
            // Store it in the partition map. We need to add an eviction strategy here.
            if (!(objectId in dispensers)) {
                const collection = await objectsCollectionP;
                dispensers[objectId] = new TakeANumber(objectId, collection, producer, sendTopic);
                if (!(message.partition in partitionMap)) {
                    partitionMap[message.partition] = [objectId];
                } else if (partitionMap[message.partition].indexOf(objectId) === -1) {
                    partitionMap[message.partition].push(objectId);
                }
                console.log(`Brand New object Found: ${objectId}`);
            }
            const dispenser = dispensers[objectId];
            await dispenser.ticket(message);

            // Periodically checkpoints to mongo and checkpoints offset back to kafka.
            // Ideally there should be a better strategy to figure out when to checkpoint.
            if (message.offset % CheckpointBatchSize === 0) {
                for (let partition of Object.keys(partitionMap)) {
                    // Find out most lagged offset across all document assigned to this partition.
                    let mostLaggedOffset = Number.MAX_VALUE;
                    for (let doc of partitionMap[partition]) {
                        await dispensers[doc].checkpoint(); // Checkpoint to mongo first.
                        mostLaggedOffset = Math.min(mostLaggedOffset, Number(dispensers[doc].getOffset()));
                    }
                    consumerOffset.commit(groupId,
                        [{ topic: message.topic, partition: Number(partition), offset: mostLaggedOffset }],
                        (error, data) => {
                                if (error) {
                                    console.error(`Error checkpointing kafka offset: ${error}`);
                                } else {
                                    console.log(`Checkpointed partition ${partition} with offset ${mostLaggedOffset}`);
                                }
                        });
                }
            }
        });
    },
    (error) => {
        console.error(error);
    });
