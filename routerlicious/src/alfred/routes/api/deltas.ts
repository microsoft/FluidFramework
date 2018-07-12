import { Router } from "express";
import { Provider } from "nconf";
import now = require("performance-now");
import * as winston from "winston";
import * as ws from "ws";
import * as api from "../../../api-core";
import * as utils from "../../../utils";
import { IAlfredTenant } from "../../tenant";

export function getDeltas(
    mongoManager: utils.MongoManager,
    collectionName: string,
    tenantId: string,
    documentId: string,
    from?: number,
    to?: number): Promise<api.ISequencedDocumentMessage[]> {

    // Create an optional filter to restrict the delta range
    const query: any = { documentId, tenantId };
    if (from !== undefined || to !== undefined) {
        query["operation.sequenceNumber"] = {};

        if (from !== undefined) {
            query["operation.sequenceNumber"].$gt = from;
        }

        if (to !== undefined) {
            query["operation.sequenceNumber"].$lt = to;
        }
    }

    // Query for the deltas and return a filtered version of just the operations field
    const deltasP = mongoManager.getDatabase().then(async (db) => {
        const collection = await db.collection<any>(collectionName);
        const dbDeltas = await collection.find(query, { "operation.sequenceNumber": 1 });

        return dbDeltas.map((delta) => delta.operation);
    });

    return deltasP;
}

export function create(config: Provider, mongoManager: utils.MongoManager, appTenants: IAlfredTenant[]): Router {
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const router: Router = Router();

    function stringToSequenceNumber(value: string): number {
        const parsedValue = parseInt(value, 10);
        return isNaN(parsedValue) ? undefined : parsedValue;
    }

    router.get("/test/:id/:path", (request, response) => {
        winston.info(request.query);
        const messages = Number.parseInt(request.query.messages) || 1000;
        const batchSize = Number.parseInt(request.query.batchSize) || 1;
        const sendPerInterval = Number.parseInt(request.query.sendPerInterval) || 1;

        const socket = new ws(`ws://${request.params.id}:5000/${request.params.path}`);
        let start: number;
        let totalBytes = 0;
        let sumLatency = 0;
        const totalMessages = messages * batchSize;

        socket.on(
            "open",
            () => {
                start = now();
                let i = 0;
                let counter = 0;

                function sendBatch() {
                    const batch = [];
                    for (let j = 0; j < batchSize; j++) {
                        batch.push(`${counter++}: Hello, World!`);
                    }
                    const buff = Buffer.from(JSON.stringify({ t: now(), b: batch }));
                    totalBytes += buff.byteLength;
                    socket.send(buff);
                }

                function sendNext() {
                    const loopCount = sendPerInterval === -1 ? Number.MAX_VALUE : sendPerInterval;
                    for (let j = 0; j < loopCount; j++, i++) {
                        if (i === messages) {
                            return;
                        }

                        sendBatch();
                    }

                    setImmediate(() => sendNext());
                    // setTimeout(() => sendNext(), 0);
                }

                sendNext();
                // // Begin the test
                // setInterval(
                //     () => {
                //         socket.ping(Buffer.from(now().toString()));
                //     },
                //     1000);
            });

        socket.on("pong", (data) => {
            const pingTime = Number.parseFloat(data.toString());
            winston.info(`Pong ${request.params.path}: ${now() - pingTime}`);
        });

        socket.on(
            "error",
            (error) => {
                winston.info(`ws error`, error);
            });

        socket.on(
            "close",
            (code, reason) => {
                winston.info(`ws close ${code} ${reason}`);
            });

        socket.on(
            "message",
            (message: Buffer) => {
                totalBytes += message.byteLength;
                const parsed = JSON.parse(message.toString()) as { t: number, b: string[] };
                const iteration = Number.parseInt(parsed.b[parsed.b.length - 1].split(":")[0]);
                sumLatency += now() - parsed.t;

                if (iteration === (totalMessages - 1)) {
                    const total = now() - start;
                    const avg = total / totalMessages;
                    const mps = totalMessages / total * 1000;
                    const mbps = (totalBytes / 1000000) / (total / 1000);
                    const tpm = sumLatency / messages;

                    winston.info(`Total time: ${total}`);
                    winston.info(`Time / message: ${avg}`);
                    winston.info(`Messages / second: ${mps}`);
                    winston.info(`MB / second: ${mbps}`);
                    response.status(200).json({
                        // tslint:disable-next-line
                        avg, mps, tpm, total, totalMessages, messages, batchSize, mbps, sendPerInterval });
                    socket.close();
                }
            });
    });

    /**
     * Retrieves deltas for the given document. With an optional from and to range (both exclusive) specified
     */
    router.get("/:tenantId?/:id", (request, response, next) => {
        const from = stringToSequenceNumber(request.query.from);
        const to = stringToSequenceNumber(request.query.to);
        const tenantId = request.params.tenantId || appTenants[0].id;

        // Query for the deltas and return a filtered version of just the operations field
        const deltasP = getDeltas(
            mongoManager,
            deltasCollectionName,
            tenantId,
            request.params.id,
            from,
            to);

        deltasP.then(
            (deltas) => {
                response.status(200).json(deltas);
            },
            (error) => {
                response.status(500).json(error);
            });
    });

    return router;
}
