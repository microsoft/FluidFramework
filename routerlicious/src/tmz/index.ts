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
import * as work from "./randomWorker";
import * as state from "./stateManager";

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

const stateManager = new state.StateManager();
const workManager = new work.RandomWorker(stateManager);

async function run() {
    const deferred = new utils.Deferred<void>();

    // open a socketio connection and start listening for workers.
    io.on("connection", (socket) => {
        socket.on("workerObject", async (message: socketStorage.IWorker, response) => {
            const newWorker: messages.IWorkerDetail = {
                worker: message,
                socket,
            };
            console.log(`New worker: ${socket.id}. ${message.clientId}`);
            stateManager.addWorker(newWorker);
            // Process all pending tasks once the first worker joins.
            if (!connected) {
                let workIds = Array.from(pendingWork);
                await processWork(workIds, createdRequests);
                pendingWork.clear();
                connected = true;
            }
            response(null, "Added");
        });
        socket.on("heartbeatObject", async (message: socketStorage.IWorker, response) => {
            console.log(`TMZ received a heartbeat: ${message.clientId}`);
            response(null, "Heartbeat");
        });
        socket.on("disconnect", async () => {
            console.log(`${socket.id} just disconnected`);
            const worker = stateManager.getWorker(socket.id);
            const tasks = stateManager.getDocuments(worker);
            stateManager.removeWorker(worker);
            await processWork(tasks, createdRequests);
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

    const q = queue(async (message: any, callback) => {
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
        await processWork([objectId], createdRequests);
        callback();
    }, 1);

    return deferred.promise;
}

// Request subscribers to pick up the work.
async function processWork(ids: string[], requestMap: any) {
    await Promise.all(workManager.assignWork(ids));
    ids.map((id) => requestMap[id] = true);
}

// Start up the TMZ service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
