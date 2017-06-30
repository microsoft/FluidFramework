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
import * as messages from "./messages";

// Setup Kafka connection
const kafkaEndpoint = nconf.get("kafka:lib:endpoint");
const kafkaLibrary = nconf.get("kafka:lib:name");
const topic = nconf.get("tmz:topic");
const groupId = nconf.get("tmz:groupId");

// Setup redis for socketio
let io = socketIo();

let host = nconf.get("redis:host");
let redisPort = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

let options: any = { auth_pass: pass };
if (nconf.get("redis:tls")) {
    options.tls = {
        servername: host,
    };
}

let pubOptions = _.clone(options);
let subOptions = _.clone(options);

let pub = redis.createClient(redisPort, host, pubOptions);
let sub = redis.createClient(redisPort, host, subOptions);
io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));

let port = nconf.get("tmz:port");
let connected = false;

// pool of connected clients to hand out work.
const clientPool: messages.IWorkerDetail[] = [];

async function run() {
    const deferred = new utils.Deferred<void>();

    // open a socketio connection and start listening for workers.
    io.on("connection", (socket) => {
        socket.on("workerObject", (message: socketStorage.IWorker, response) => {
            // Process all pending tasks once the first worker joins.
            if (!connected) {
                let workIds = Array.from(pendingWork);
                for (let doc of workIds) {
                    requestWork(doc, createdRequests);
                }
                pendingWork.clear();
                connected = true;
            }
            console.log(`New worker: ${socket.id}. ${message.clientId}`);
            const workerDetail: messages.IWorkerDetail = {
                worker: message,
                socket,
            };
            clientPool.push(workerDetail);
            response(null, "Added");
        });
    });
    io.listen(port);

    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic);
    const createdRequests: any = {};
    const pendingWork: Set<string> = new Set();

    consumer.on("data", (message) => {
        q.push(message);
    });

    consumer.on("error", (err) => {
        consumer.close();
        deferred.reject(err);
    });

    const q = queue((message: any, callback) => {
        const value = JSON.parse(message.value.toString("utf8")) as core.IRawOperationMessage;
        const objectId = value.objectId;

        if (createdRequests[objectId]) {
            callback();
            return;
        }

        // No worker joined yet. Store document to process later.
        if (!connected) {
            pendingWork.add(objectId);
            callback();
            return;
        }

        logger.info(`Requesting snapshots for ${objectId}`);
        requestWork(objectId, createdRequests);
        callback();
    }, 1);

    return deferred.promise;
}

// Request subscribers to pick up the work.
function requestWork(id: string, requestMap: any) {
    let worker = clientPool[Math.floor(Math.random() * clientPool.length)];
    logger.info(`Chosen worker: ${JSON.stringify(worker.worker.clientId)}`);

    worker.socket.emit("TaskObject", worker.worker.clientId, id, (error, ack: socketStorage.IWorker) => {
        if (ack) {
            logger.info(`Client ${ack.clientId} acknowledged the work`);
            requestMap[id] = true;
        } else {
            logger.error(error);
        }
    });
}

// Start up the TMZ service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
