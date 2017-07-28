import * as minio from "minio";
import { Collection, MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as api from "../api";
import * as socketStorage from "../socket-storage";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Connection to stored document details
const mongoUrl = nconf.get("mongo:endpoint");
const client = MongoClient.connect(mongoUrl);
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
const objectsCollectionP = client.then((db) => db.collection(objectsCollectionName));
const minioConfig = nconf.get("minio");
const storageBucket = nconf.get("paparazzi:bucket");
const chunkSize = nconf.get("perf:chunkSize");

 // Connect to Alfred for default storage options
const alfredUrl = nconf.get("paparazzi:alfred");

// Interface to mimic map operation.
interface IMapOperation {
    type: string;
    key?: string;
    value?: any;
}

// Storage functions to make the API work.
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

async function loadObject(
    services: api.ICollaborationServices,
    collection: Collection,
    id: string): Promise<api.ICollaborativeObject> {

    console.log(`${id}: Loading`);
    const dbObject = await collection.findOne({ _id: id });
    console.log(`${id}: Found`);

    // TODO
    // TODO
    // TODO
    // This needs to load in an extension as well
    const extension = api.defaultRegistry.getExtension(dbObject.type);
    const sharedObject = extension.load(id, services, api.defaultRegistry);

    console.log(`${id}: Loaded`);
    return sharedObject;
}

// Initialize Socket.io and connect to the Redis adapter
let redisConfig = nconf.get("redis");
let io = socketIoEmitter(({ host: redisConfig.host, port: redisConfig.port }));
io.redis.on("error", (error) => {
    console.error(`Error with socket io emitter: ${error}`);
});

console.log("Perf testing alfred...");
runTest();

const objectId = "test-document";
let startTime: number;
let sendStopTime: number;
let receiveStartTime: number;
let endTime: number;
async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka, zookeeper, and redis....");
    await sleep(10000);
    await consume();
    console.log("Done receiving from alfred. Printing Final Metrics....");
    console.log(`Send to Socket IO time: ${sendStopTime - startTime}`);
    console.log(`Receiving from alfred time: ${endTime - receiveStartTime}`);
    console.log(`Total time: ${endTime - startTime}`);
}

// Producer to send messages to redis throguh socket io emitter.
async function produce() {
    const operation: IMapOperation = {
        key: "testkey",
        type: "set",
        value: "testvalue",
    };
    startTime = Date.now();
    for (let i = 1; i <= chunkSize; ++i) {
        const sequencedOperation: api.ISequencedMessage = {
            clientId: "test-client",
            clientSequenceNumber: 123,
            minimumSequenceNumber: 0,
            op: operation,
            referenceSequenceNumber: 123,
            sequenceNumber: i,
            type: "op",
            userId: "test-user",
        };
        let outputMessage: api.IBase;
        outputMessage = sequencedOperation;

        io.to(objectId).emit("op", objectId, outputMessage);
    }
    sendStopTime = Date.now();
}

// Cosumer connects to alfred as a client and receives messages.
async function consume() {
    // Create the object first in the DB.
    await getOrCreateObject(objectId, "https://graph.microsoft.com/types/map");

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
        objectStorageService: new socketStorage.ClientObjectStorageService(alfredUrl),
    };

    await getOrCreateBucket(minioClient, storageBucket);
    const collection = await objectsCollectionP;
    let messagesLeft: number = chunkSize;

    return new Promise<any>((resolve, reject) => {
        loadObject(services, collection, objectId).then(async (doc) => {
            doc.on("valueChanged", () => {
                if (messagesLeft === chunkSize) {
                    receiveStartTime = Date.now();
                }
                if (messagesLeft === 1) {
                    endTime = Date.now();
                    resolve({data: true});
                }
                --messagesLeft;
            });

            // Wait for 2 seconds to make sure that the listener is set up.
            // Then start producing messages.
            console.log("Wait for 2 seconds for the listener to set up....");
            await sleep(2000);
            console.log(`Start producing....`);
            produce();
        },
        (error) => {
            console.error(`Error: Couldn't connect ${error}`);
            reject(error);
        });
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
