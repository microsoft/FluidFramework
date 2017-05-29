// import * as _ from "lodash";
import { Collection, MongoClient } from "mongodb";
import * as minio from "minio";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as api from "../api";
import * as socketStorage from "../socket-storage";
// import * as redis from "redis";
// import * as msgpack from "msgpack-lite";
import { ObjectStorageService } from "../paparazzi/objectStorageService";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Connection to stored document details
const mongoUrl = nconf.get("mongo:endpoint");
const client = MongoClient.connect(mongoUrl);
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
const objectsCollectionP = client.then((db) => db.collection(objectsCollectionName));

const minioConfig = nconf.get("minio");
const storageBucket = nconf.get("paparazzi:bucket");

 // Connect to Alfred for default storage options
const alfredUrl = nconf.get("paparazzi:alfred");

 interface IMapOperation {
    type: string;
    key?: string;
    value?: any;
}

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

const chunkSize = nconf.get("perf:chunkSize");

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



// Initialize Socket.io and connect to the Redis adapter
let redisConfig = nconf.get("redis");
let io = socketIoEmitter(({ host: redisConfig.host, port: redisConfig.port }));
io.redis.on("error", (error) => {
    console.error(`Error with socket io emitter: ${error}`);
});

/*
// Setup redis client
let host = nconf.get("redis:host");
let port = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

let options: any = { auth_pass: pass, return_buffers: true };
if (nconf.get("redis:tls")) {
    options.tls = {
        servername: host,
    };
}
let subOptions = _.clone(options);

// Subscriber to read from redis directly.
let sub = redis.createClient(port, host, subOptions);
*/

console.log("Perf testing alfred...");
runTest();

const objectId = "test-document";

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka, zookeeper, and redis....");
    await sleep(10000);
    consume2();
    console.log(`Done consumer prepping...`);
    //produce();
}

async function produce() {
    for (let i = 1; i <= chunkSize; ++i) {

        const operation: IMapOperation = {
            type: "set",
            key: "testkey",
            value: "testvalue"
        };

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
}

/*
async function consume() {
    return new Promise<any>((resolve, reject) => {
        sub.on("message", function(channel, message) {
            let decodedMessage = msgpack.decode(message);
            console.log(`From receiver: ${JSON.stringify(decodedMessage)}`);
        });
        // Subscribing to specific redis channel for this document.
        sub.subscribe("socket.io#/#test-document#");
    });
}*/


async function consume2() {
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
        objectStorageService: new ObjectStorageService(alfredUrl, minioClient, storageBucket),
    };

    await getOrCreateBucket(minioClient, storageBucket);
    const collection = await objectsCollectionP;
    let messagesLeft: number = chunkSize;

    loadObject(services, collection, objectId).then(async (doc) => {
        console.log(`Doc loaded id...: ${doc.id}`);
        console.log(`Doc loaded type...: ${doc.type}`);
        // Display the initial values and then listen for updates
        doc.on("valueChanged", () => {
            console.log(`Value changed received`);
            --messagesLeft;
            if (messagesLeft === 0) {
                console.log(`We are done...`);
            }
        });
        doc.on("op", () => {
            console.log(`Operation received`);
        });
        await sleep(2000);
        console.log(`Start producing....`);
        produce();
    },    
    (error) => {
        console.error(`Error: Couldn't connect ${error}`);
    });    

}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
