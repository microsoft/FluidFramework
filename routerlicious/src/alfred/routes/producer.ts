import { Router } from "express";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as core from "../../core";
import * as map from "../../map";
import * as utils from "../../utils";
import { logger } from "../../utils";

const router: Router = Router();

let producerRunning = false;

// Group this into some kind of an interface
const kafkaEndpoint = nconf.get("perf:lib:endpoint");
const kafkaLibrary = nconf.get("perf:lib:name");
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
    const producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, "testproducer", topic);
    const throughput = new utils.ThroughputCounter(logger.info);

    await getOrCreateObject("producer", map.MapExtension.Type);

    let clientSequenceNumber = 1;
    producerInterval = setInterval(() => {
        const rawMessage: core.IRawOperationMessage = {
            clientId: "producer",
            documentId: "producer",
            operation: {
                document: {
                    clientSequenceNumber,
                    referenceSequenceNumber: 0,
                },
                object: {
                    clientSequenceNumber,
                    referenceSequenceNumber: 0,
                },
                op: {
                    key: "binky",
                    type: "set",
                    value: "winky",
                },
            },
            timestamp: Date.now(),
            type: core.RawOperationType,
            userId: "producer",
        };
        clientSequenceNumber++;

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
