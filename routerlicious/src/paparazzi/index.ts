import * as amqp from "amqplib";
import * as minio from "minio";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as api from "../api";
import * as socketStorage from "../socket-storage";
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

const connectionP = amqp.connect(connectionString);
const channelP = connectionP.then((connection) => connection.createChannel());

const minioConfig = nconf.get("minio");
const minioClient = new minio.Client({
    accessKey: minioConfig.accessKey,
    endPoint: minioConfig.endpoint,
    port: minioConfig.port,
    secretKey: minioConfig.secretKey,
    secure: false,
});

const storageBucket = nconf.get("paparazzi:bucket");

// Connect to Alfred for default storage options
const alfredUrl = nconf.get("paparazzi:alfred");
const services: api.ICollaborationServices = {
    deltaNotificationService: new socketStorage.DeltaNotificationService(alfredUrl),
    deltaStorageService: new socketStorage.DeltaStorageService(alfredUrl),
    objectStorageService: new ObjectStorageService(alfredUrl, minioClient, storageBucket),
};

async function bucketExists(bucket: string) {
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

async function makeBucket(bucket: string) {
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

async function getOrCreateBucket(bucket: string) {
    const exists = await bucketExists(bucket);
    if (!exists) {
        return await makeBucket(bucket);
    }
}

async function loadDocument(id: string): Promise<api.ICollaborativeObject> {
    console.log(`Loading in root document for ${id}...`);
    const collection = await objectsCollectionP;
    const dbObject = await collection.findOne({ _id: id });

    const extension = api.defaultRegistry.getExtension(dbObject.type);
    const sharedObject = extension.load(id, services, api.defaultRegistry);

    console.log("Shared object loaded");
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

    console.log("Snapshotting");
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

function handleDocument(id: string) {
    // don't use the document here - just load directly

    loadDocument(id).then((doc) => {
        // TODO need a generic way to know that the object has 'changed'

        // Display the initial values and then listen for updates
        doc.on("valueChanged", () => {
            serialize(doc);
        });

        doc.on("op", () => {
            serialize(doc);
        });
    },
    (error) => {
        console.error(`Couldn't connect ${JSON.stringify(error)}`);
    });
}

/**
 * Processes a message received from a service bus queue
 */
function processMessage(message: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        handleDocument(message);
        resolve();
    });
}

async function run() {
    await getOrCreateBucket(storageBucket);
    const channel = await channelP;

    channel.assertQueue(queueName, { durable: true });
    channel.prefetch(1);

    channel.consume(
        queueName,
        (message) => {
            processMessage(message.content.toString()).then(() => {
                channel.ack(message);
            });
        },
        { noAck: false });
}

run();
