import { queue } from "async";
import * as winston from "winston";
import * as core from "../core";
import * as shared from "../shared";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import * as messages from "./messages";
import * as workerFactory from "./workerFactory";

export class TmzRunner implements utils.IRunner {
    private deferred = new shared.Deferred<void>();
    private foreman: messages.IForeman;
    private q: AsyncQueue<string>;
    private pendingWork: Set<string> = new Set();
    private checkerInterval: NodeJS.Timer;
    private workerJoined = false;

    constructor(
        private io: any,
        private port: any,
        private consumer: utils.kafkaConsumer.IConsumer,
        schedulerType: string,
        private onlyServer: boolean,
        private checkerTimeout: number) {

        this.foreman = workerFactory.create(schedulerType);
    }

    public start(): Promise<void> {
        // open a socketio connection and start listening for workers.
        this.io.on("connection", (socket) => {
            // On joining, add the worker to manager.
            socket.on("workerObject", async (message: socketStorage.IWorker, response) => {
                if (!(this.onlyServer && message.type === "Client")) {
                    const newWorker: messages.IWorkerDetail = {
                        worker: message,
                        socket,
                    };
                    winston.info(`New worker joined. ${socket.id} : ${message.clientId}`);
                    this.foreman.getManager().addWorker(newWorker);
                    // Process all pending tasks once the first worker joins.
                    if (!this.workerJoined) {
                        let workIds = Array.from(this.pendingWork);
                        await this.processWork(workIds);
                        this.pendingWork.clear();
                        this.workerJoined = true;
                    }
                    response(null, "Acked");
                } else {
                    response(null, "Nacked");
                }

            });
            // On a heartbeat, refresh worker state.
            socket.on("heartbeatObject", async (message: socketStorage.IWorker, response) => {
                const worker: messages.IWorkerDetail = {
                    worker: message,
                    socket,
                };
                this.foreman.getManager().refreshWorker(worker);
                response(null, "Heartbeat");
            });
            // On disconnect, reassign the work to other workers.
            socket.on("disconnect", async () => {
                winston.info(`Worker id ${socket.id} got disconnected.`);
                const worker = this.foreman.getManager().getWorker(socket.id);
                if (worker) {
                    const tasks = this.foreman.getManager().getDocuments(worker);
                    this.foreman.getManager().removeWorker(worker);
                    await this.processWork(tasks);
                }
            });

        });
        this.io.listen(this.port);

        // Periodically check and update work assigment.
        this.checkerInterval = setInterval(async () => {
            await this.adjustWorkAssignment();
        }, this.checkerTimeout);

        this.consumer.on("data", (message) => {
            this.q.push(message);
        });

        this.consumer.on("error", (err) => {
            this.consumer.close();
            this.deferred.reject(err);
        });

        this.q = queue(async (message: any, callback) => {
            const value = JSON.parse(message.value.toString("utf8")) as core.IRawOperationMessage;
            const documentId = value.documentId;

            // Check if already requested. Update the Timestamp in the process.
            if (this.foreman.getManager().updateDocumentIfFound(documentId)) {
                callback();
                return;
            }

            // No worker joined yet. Store document to process later.
            if (!this.workerJoined) {
                this.pendingWork.add(documentId);
                callback();
                return;
            }

            winston.info(`Requesting work for ${documentId}`);
            await this.processWork([documentId]);
            callback();
        }, 1);

        return this.deferred.promise;
    }

    public stop(): Promise<void> {
        winston.info("Stop requested");

        clearInterval(this.checkerInterval);
        this.consumer.pause();

        // Drain the queue of any pending operations
        const drainedP = new Promise<void>((resolve, reject) => {
            // If not entries in the queue we can exit immediatley
            if (this.q.length() === 0) {
                winston.info("No pending work exiting early");
                return resolve();
            }

            // Wait until the queue is drained
            winston.info("Waiting for queue to drain");
            this.q.drain = () => {
                winston.info("Drained");
                resolve();
            };
        });

        // Mark ourselves done once the queue is cleaned
        drainedP.then(() => {
            // TODO perform one last checkpoint here
            this.deferred.resolve();
        });

        return this.deferred.promise;
    }

    // Request subscribers to pick up the work.
    private async processWork(ids: string[]) {
        try {
            return await Promise.all(this.foreman.assignWork(ids));
        } catch (err) {
            return err;
        }
    }

    private async adjustWorkAssignment() {
        // Get work form inactive workers and reassign them
        const documents = this.foreman.getManager().revokeDocumentsFromInactiveWorkers();
        if (documents.length > 0) {
            await this.processWork(documents);
        }
        // Check Expired documents and update the state.
        await Promise.all(this.foreman.revokeExpiredWork());
    }
}
