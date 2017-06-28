// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import { queue } from "async";
import * as _ from "lodash";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as core from "../core";
import * as socketStorage from "../socket-storage";
import { logger } from "../utils";
import * as utils from "../utils";

// Setup Kafka connection
const kafkaEndpoint = nconf.get("kafka:lib:endpoint");
const kafkaLibrary = nconf.get("kafka:lib:name");
const topic = nconf.get("tmz:topic");
const groupId = nconf.get("tmz:groupId");

// Setup redis for socketio
let io = socketIo();

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

async function run() {
    const deferred = new utils.Deferred<void>();
    console.log(`Trying to launch io`);
    const clientPool = [];
    let socketObj : SocketIO.Socket;

    io.on("connection", (socket) => {
        socketObj = socket;
        socket.on("workerObject", (clientId: string, message: socketStorage.IWork, response) => {
            console.log(`TMZ received a new connection from ${clientId}: ${JSON.stringify(message)}`);
            clientPool.push(clientId);
            socket.emit("TaskObject", "Test-Task", (error) => {
                console.log(`Error sending reply`);
            });
        });
    });

    console.log(`Listening to port 4000`);
    io.listen(4000);

    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic);
    const createdRequests: any = {};

    consumer.on("data", (message) => {
        q.push(message);
    });

    consumer.on("error", (err) => {
        consumer.close();
        deferred.reject(err);
    });

    const q = queue((message: any, callback) => {
        const value = JSON.parse(message.value.toString("utf8")) as core.IRawOperationMessage;
        if (createdRequests[value.objectId]) {
            callback();
            return;
        }
        logger.info(`Requesting snapshots for ${value.objectId}`);
        socketObj.emit("TaskObject", value.objectId, (error) => {
            console.log(`Some error happened: ${error}`);
        });
        createdRequests[value.objectId] = true;
        callback();
    }, 1);

    return deferred.promise;
}

// Start up the TMZ service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
