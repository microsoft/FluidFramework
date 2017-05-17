import * as kafka from "kafka-node";
import * as _ from "lodash";
import { MongoClient } from "mongodb";
import * as moniker from "moniker";
import * as nconf from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as api from "../api";
import * as core from "../core";
import * as socketStorage from "../socket-storage";

let io = socketIo();

// Group this into some kind of an interface
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("alfred:kafkaClientId");
const topic = nconf.get("alfred:topic");

let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);
let producer = new kafka.Producer(kafkaClient, { partitionerType: 3 });
let producerReady = new Promise<void>((resolve, reject) => {
    producer.on("ready", () => {
        kafkaClient.refreshMetadata([topic], (error, data) => {
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

// Setup redis
let host = nconf.get("redis:host");
let port = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

let options: any = { auth_pass: pass };
if (nconf.get("redis:tls")) {
    options.tls = {
        servername: host,
    };
}

let pubOptions = _.clone(options);
let subOptions = _.clone(options);

let pub = redis.createClient(port, host, pubOptions);
let sub = redis.createClient(port, host, subOptions);
io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));

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

io.on("connection", (socket) => {
    const clientId = moniker.choose();
    const connectionsMap: { [id: string]: boolean } = {};

    // The loadObject call needs to see if the object already exists. If not it should offload to
    // the storage service to go and create it.
    //
    // If it does exist it should query that same service to pull in the current snapshot.
    //
    // Given a client is then going to send us deltas on that service we need routerlicious to kick in as well.
    // Note connect is a reserved socket.io word so we use connectObject to represent the connect request
    socket.on("connectObject", (message: socketStorage.IConnect, response) => {
        // Join the room first to ensure the client will start receiving delta updates
        console.log(`Client has requested to load ${message.objectId}`);

        const existingP = getOrCreateObject(message.objectId, message.type);
        existingP.then(
            (existing) => {
                socket.join(message.objectId, (joinError) => {
                    if (joinError) {
                        return response(joinError, null);
                    }

                    console.log(`Existing object ${existing}`);
                    connectionsMap[message.objectId] = true;
                    const connectedMessage: socketStorage.IConnected = {
                        clientId,
                        existing,
                    };
                    response(null, connectedMessage);
                });
            },
            (error) => {
                console.error("Error fetching");
                console.error(error);
                response(error, null);
            });
    });

    // Message sent when a new operation is submitted to the router
    socket.on("submitOp", (objectId: string, message: api.IMessage, response) => {
        console.log(`Operation received for object ${objectId}`);

        // Verify the user has connected on this object id
        if (!connectionsMap[objectId]) {
            return response("Invalid object", null);
        }

        const rawMessage: core.IRawOperationMessage = {
            clientId,
            operation: message,
            objectId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            userId: null,
        };

        let submittedP = producerReady.then(() => {
            const payloads = [{ topic, messages: [JSON.stringify(rawMessage)], key: objectId }];
            return new Promise<any>((resolve, reject) => {
                producer.send(payloads, (error, data) => {
                    if (error) {
                        return reject(error);
                    }

                    console.log(data);
                    resolve({ data: true });
                });
            });
        });

        submittedP.then(
            (responseMessage) => response(null, responseMessage),
            (error) => response(error, null));
    });

    socket.on("updateReferenceSequenceNumber", (objectId: string, sequenceNumber: number, response) => {
        console.log(`${clientId} Updating ${objectId} to ${sequenceNumber}`);

        // Verify the user has connected on this object id
        if (!connectionsMap[objectId]) {
            return response("Invalid object", null);
        }

        const message: core.IUpdateReferenceSequenceNumberMessage = {
            clientId,
            objectId,
            sequenceNumber,
            timestamp: Date.now(),
            type: core.UpdateReferenceSequenceNumberType,
            userId: null,
        };

        let submittedP = producerReady.then(() => {
            const payloads = [{ topic, messages: [JSON.stringify(message)], key: objectId }];
            return new Promise<any>((resolve, reject) => {
                producer.send(payloads, (error, data) => {
                    if (error) {
                        return reject(error);
                    }

                    resolve();
                });
            });
        });

        submittedP.then(
            (responseMessage) => response(null, responseMessage),
            (error) => response(error, null));
    });
});

export default io;
