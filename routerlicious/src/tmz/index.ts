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
import * as workerFactory from "./workerFactory";

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

// setup state manager and work manager.
let port = nconf.get("tmz:port");
const checkerTimeout = nconf.get("tmz:timeoutMSec:checker");
const schedulerType = nconf.get("tmz:workerType");

const foreman = workerFactory.create(schedulerType);
const pendingWork: Set<string> = new Set();
let workerJoined = false;

async function run() {
    const deferred = new utils.Deferred<void>();

    // open a socketio connection and start listening for workers.
    io.on("connection", (socket) => {
        // On joining, add the worker to manager.
        socket.on("workerObject", async (message: socketStorage.IWorker, response) => {
            const newWorker: messages.IWorkerDetail = {
                worker: message,
                socket,
            };
            logger.info(`New worker joined. ${socket.id} : ${message.clientId}`);
            foreman.getManager().addWorker(newWorker);
            // Process all pending tasks once the first worker joins.
            if (!workerJoined) {
                let workIds = Array.from(pendingWork);
                await processWork(workIds);
                pendingWork.clear();
                workerJoined = true;
            }
            response(null, "Added");
        });
        // On a heartbeat, refresh worker state.
        socket.on("heartbeatObject", async (message: socketStorage.IWorker, response) => {
            foreman.getManager().refreshWorker(socket.id);
            response(null, "Heartbeat");
        });
        // On disconnect, reassign the work to other workers.
        socket.on("disconnect", async () => {
            logger.info(`Worker id ${socket.id} got disconnected.`);
            const worker = foreman.getManager().getWorker(socket.id);
            const tasks = foreman.getManager().getDocuments(worker);
            foreman.getManager().removeWorker(worker);
            await processWork(tasks);
        });

    });
    io.listen(port);

    // Periodically check and update work assigment.
    setInterval(async () => {
        await adjustWorkAssignment();
    }, checkerTimeout);

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
        if (foreman.getManager().updateDocumentIfFound(objectId)) {
            callback();
            return;
        }

        // No worker joined yet. Store document to process later.
        if (!workerJoined) {
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

// Request subscribers to pick up the work.
async function processWork(ids: string[]) {
    await Promise.all(foreman.assignWork(ids));
}

async function adjustWorkAssignment() {
    // Get work form inactive workers and reassign them
    const documents = foreman.getManager().revokeDocumentsFromInactiveWorkers();
    if (documents.length > 0) {
        await processWork(documents);
    }
    // Check Expired documents and update the state.
    await Promise.all(foreman.revokeExpiredWork());
}

// Start up the TMZ service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
