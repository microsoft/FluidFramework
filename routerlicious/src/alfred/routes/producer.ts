import { Router } from "express";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as api from "../../api";
import * as core from "../../core";
import * as utils from "../../utils";
import { logger } from "../../utils";

const router: Router = Router();

let producerRunning = false;

// Group this into some kind of an interface
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("alfred:kafkaClientId");
const topic = nconf.get("alfred:topic");

// Connection to stored document details
const mongoUrl = nconf.get("mongo:endpoint");
const client = MongoClient.connect(mongoUrl);
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
const objectsCollectionP = client.then((db) => db.collection(objectsCollectionName));

async function getOrCreateObject(id: string, type: string): Promise<boolean> {
    const collection = await objectsCollectionP;
    const dbObjectP = collection.findOne({ _id: id });
    return dbObjectP.then(
        (dbObject) => {
            if (dbObject) {
                if (dbObject.type !== type) {
                    throw new Error("Mismatched shared types");
                }

                return true;
            } else {
                return collection.insertOne({ _id: id, type }).then(() => false);
            }
        });
}

let producerRateInterval;
let producerInterval;

async function startProducer(batchSize: number) {
    // Producer used to publish messages
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaClientId, topic);
    const throughput = new utils.ThroughputCounter(logger.info);

    await getOrCreateObject("producer", api.MapExtension.Type);

    let clientSequenceNumber = 1;
    producerInterval = setInterval(() => {
        const rawMessage: core.IRawOperationMessage = {
            clientId: "producer",
            objectId: "producer",
            operation: {
                clientSequenceNumber: clientSequenceNumber++,
                op: {
                    key: "binky",
                    type: "set",
                    value: "winky",
                },
                referenceSequenceNumber: 0,
            },
            timestamp: Date.now(),
            type: core.RawOperationType,
            userId: "producer",
        };

        for (let i = 0; i < batchSize; i++) {
            throughput.produce();
            producer.send(JSON.stringify(rawMessage), "producer").then(
                (responseMessage) => {
                    throughput.acknolwedge();
                },
                (error) => {
                    logger.error(error);
                });
        }
    }, 0);
}

function stopProducer() {
    clearInterval(producerRateInterval);
    clearInterval(producerInterval);
}

router.get("/:batchSize?", (request, response, next) => {
    if (producerRunning) {
        stopProducer();
    } else {
        startProducer(parseInt(request.params.batchSize, 10));
    }

    producerRunning = !producerRunning;
    response.status(200).json(producerRunning);
});

export default router;
