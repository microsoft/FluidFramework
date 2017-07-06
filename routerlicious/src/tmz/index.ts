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

const stateManager = new state.StateManager(15000, 20000);
const workManager = new work.RandomWorker(stateManager);
const pendingWork: Set<string> = new Set();

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
                await processWork(workIds);
                pendingWork.clear();
                connected = true;
            }
            response(null, "Added");
        });
        socket.on("heartbeatObject", async (message: socketStorage.IWorker, response) => {
            console.log(`TMZ received a heartbeat: ${message.clientId}`);
            stateManager.refreshWorker(socket.id);
            response(null, "Heartbeat");
        });
        socket.on("disconnect", async () => {
            console.log(`${socket.id} just disconnected`);
            const worker = stateManager.getWorker(socket.id);
            const tasks = stateManager.getDocuments(worker);
            stateManager.removeWorker(worker);
            await processWork(tasks);
        });

    });
    io.listen(port);

    setInterval(async () => {
        await reassignWork();
        await expireDocument();
    }, 10000);

    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic);

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

        // Check if already requested. Update the Timestamp in the process.
        if (stateManager.updateDocumentIfFound(objectId)) {
            callback();
            return;
        }

        // No worker joined yet. Store document to process later.
        if (!connected) {
            pendingWork.add(objectId);
            callback();
            return;
        }

        logger.info(`Requesting work for ${objectId}`);
        await processWork([objectId]);
        callback();
    }, 1);

    return deferred.promise;
}

async function reassignWork() {
    const documents = stateManager.getDocumentsFromInactiveWorkers();
    if (documents.length > 0) {
        await processWork(documents);
    }
}

async function expireDocument() {
    await Promise.all(workManager.revokeWork());
}

// Request subscribers to pick up the work.
async function processWork(ids: string[]) {
    await Promise.all(workManager.assignWork(ids));
}

// Start up the TMZ service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
