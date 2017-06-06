import * as amqp from "amqplib";
import * as minio from "minio";
import { Collection, MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as api from "../api";
import { resume, textAnalytics } from "../intelligence";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import { IntelligentServicesManager } from "./intelligence";
import { ObjectStorageService } from "./objectStorageService";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Connection to stored document details
const mongoUrl = nconf.get("mongo:endpoint");
const client = MongoClient.connect(mongoUrl);
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
const objectsCollectionP = client.then((db) => db.collection(objectsCollectionName));

// Queue configuration
const queueName = nconf.get("tmz:queue");
const connectionString = nconf.get("rabbitmq:connectionString");
const minioConfig = nconf.get("minio");
const storageBucket = nconf.get("paparazzi:bucket");

// Connect to Alfred for default storage options
const alfredUrl = nconf.get("paparazzi:alfred");

async function bucketExists(minioClient, bucket: string) {
    return new Promise<boolean>((resolve, reject) => {
        minioClient.bucketExists(bucket, (error) => {
            if (error && error.code !== "NoSuchBucket") {
                reject(error);
            } else {
                resolve(error ? false : true);
            }
        });
    });
}

async function makeBucket(minioClient, bucket: string) {
    return new Promise<void>((resolve, reject) => {
        minioClient.makeBucket(bucket, "us-east-1", (error) => {
            if (error) {
                return reject(error);
            } else {
                return resolve();
            }
        });
    });
}

async function getOrCreateBucket(minioClient, bucket: string) {
    const exists = await bucketExists(minioClient, bucket);
    if (!exists) {
        return await makeBucket(minioClient, bucket);
    }
}

async function loadObject(
    services: api.ICollaborationServices,
    collection: Collection,
    id: string): Promise<api.ICollaborativeObject> {

    console.log(`${id}: Loading`);
    const dbObject = await collection.findOne({ _id: id });
    console.log(`${id}: Found`);

    const extension = api.defaultRegistry.getExtension(dbObject.type);
    const sharedObject = extension.load(id, services, api.defaultRegistry);

    console.log(`${id}: Loaded`);
    return sharedObject;
}

const pendingSerializeMap: { [key: string]: boolean } = {};
const dirtyMap: { [key: string]: boolean } = {};

/**
 * Serializes the document to blob storage and then marks the latest version in mongodb
 */
function serialize(root: api.ICollaborativeObject) {
    if (pendingSerializeMap[root.id]) {
        dirtyMap[root.id] = true;
        return;
    }

    // Set a pending operation and clear any dirty flags
    pendingSerializeMap[root.id] = true;
    dirtyMap[root.id] = false;

    // console.log(`Snapshotting ${root.id}`);
    const snapshotP = root.snapshot().catch((error) => {
            // TODO we will just log errors for now. Will want a better strategy later on (replay, wait)
            if (error) {
                console.error(error);
            }

            return Promise.resolve();
        });

    // Finally clause to start snapshotting again once we finish
    snapshotP.then(() => {
        pendingSerializeMap[root.id] = false;
        if (dirtyMap[root.id]) {
            serialize(root);
        }
    });
}

function handleDocument(
    services: api.ICollaborationServices,
    collection: Collection,
    id: string,
    intelligenceManager: IntelligentServicesManager) {

    const receiveRate = new utils.RateCounter();
    setInterval(() => {
        const receive = 1000 * receiveRate.getSamples() / receiveRate.elapsed();
        console.log(`Receive ${id} @ ${receive.toFixed(2)} msg/s`);
        receiveRate.reset();
    }, 5000);

    loadObject(services, collection, id).then((doc) => {
        // TODO need a generic way to know that the object has 'changed'. Best thing here is to probably trigger
        // a message whenever the MSN changes since this is what will cause a snapshot

        // Display the initial values and then listen for updates
        doc.on("op", (op) => {
            receiveRate.increment(1);
            serialize(doc);
            intelligenceManager.process(doc);
        });
    },
    (error) => {
        console.error(`Couldn't connect ${JSON.stringify(error)}`);
    });
}

/**
 * Processes a message received from a service bus queue
 */
function processMessage(
    message: string,
    collection: Collection,
    services: api.ICollaborationServices,
    intelligenceManager: IntelligentServicesManager): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        handleDocument(services, collection, message, intelligenceManager);
        resolve();
    });
}

async function run() {
    const minioClient = new minio.Client({
        accessKey: minioConfig.accessKey,
        endPoint: minioConfig.endpoint,
        port: minioConfig.port,
        secretKey: minioConfig.secretKey,
        secure: false,
    });

    const services: api.ICollaborationServices = {
        deltaNotificationService: new socketStorage.DeltaNotificationService(alfredUrl),
        deltaStorageService: new socketStorage.DeltaStorageService(alfredUrl),
        objectStorageService: new ObjectStorageService(alfredUrl, minioClient, storageBucket),
    };

    // Create the resume intelligent service and manager
    const intelligenceManager = new IntelligentServicesManager(services);
    intelligenceManager.registerService(resume.factory.create(nconf.get("intelligence:resume")));
    intelligenceManager.registerService(textAnalytics.factory.create(nconf.get("intelligence:textAnalytics")));

    // Prep minio
    await getOrCreateBucket(minioClient, storageBucket);

    // Load the mongodb collection
    const collection = await objectsCollectionP;

    // Connect to the queue
    const connection = await amqp.connect(connectionString);
    const channel = await connection.createChannel();

    // The rabbitmq library does not support re-connect. We will simply exit and rely on being restarted once
    // we lose our connection to RabbitMQ.
    connection.on("error", (error) => {
        console.error("Lost connection to RabbitMQ - exiting");
        console.error(error);
        process.exit(1);
    });

    channel.assertQueue(queueName, { durable: true });
    channel.prefetch(1);

    channel.consume(
        queueName,
        (message) => {
            processMessage(message.content.toString(), collection, services, intelligenceManager)
                .then(() => {
                    channel.ack(message);
                })
                .catch((error) => {
                    console.error(error);
                    channel.nack(message);
                });
        },
        { noAck: false });
}

// Start up the paparazzi service
const runP = run();
runP.catch((error) => {
    console.error(error);
    process.exit(1);
});
