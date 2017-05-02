import * as kafka from "kafka-node";
import * as _ from "lodash";
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
        socket.join(message.objectId, (joinError) => {
            if (joinError) {
                return response(joinError, null);
            }

            connectionsMap[message.objectId] = true;
            const connectedMessage: socketStorage.IConnected = {
                clientId,
                // TODO distinguish new vs existing objects
                existing: true,
            };
            response(null, connectedMessage);
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
});

export default io;
