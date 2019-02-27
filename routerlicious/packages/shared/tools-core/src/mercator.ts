import * as api from "@prague/client-api";
import * as Map from "@prague/map";
import { ContainerUrlResolver } from "@prague/routerlicious-host";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import { Deferred } from "@prague/utils";
import * as jwt from "jsonwebtoken";
import * as randomstring from "randomstring";

export function generateRandomBatchMessages(length: number, payloadSize: number): string[] {
    const messages = new Array<string>();

    for (let i = 0; i < length; i++) {
        const str = randomstring.generate(payloadSize);
        messages.push(str);
    }

    return messages;
}

export function send(map: Map.ISharedMap, index: number, total: number, messages: string[]) {
    for (let i = 0; i < messages.length; i++) {
        map.set("" + (index * messages.length + i), { time: Date.now(), str: messages[i] });
    }

    if (index <= total) {
        setImmediate(
            () => {
                send(map, index + 1, total, messages);
            });
    }
}

export async function run(
    id: string,
    tenantId: string,
    secret: string,
    routerlicious: string,
    historian: string,
    batches: number,
    batchSize: number,
    payloadSize: number): Promise<any> {

    const randomMessages = generateRandomBatchMessages(batchSize, payloadSize);

    // Register endpoint connection
    const documentServices = routerlicious === "http://localhost:3030"
        ? socketStorage.createDocumentService2(routerlicious, historian)
        : socketStorage.createDocumentService(routerlicious, historian);
    api.registerDocumentService(documentServices);

    console.log("Doc id is", id);
    const token = jwt.sign(
        {
            documentId: id,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);
    const url = `prague://${routerlicious}/${encodeURIComponent(tenantId)}/${encodeURIComponent(id)}`;

    // Load in the latest and connect to the document
    const resolver = new ContainerUrlResolver(routerlicious, null);
    const tokenProvider = new socketStorage.TokenProvider(token);
    const host = { tokenProvider, resolver };

    const collabDoc = await api.load(
        url,
        host,
        { blockUpdateMarkers: true, token });
    const root = await collabDoc.getRoot();
    if (!collabDoc.isConnected) {
        await new Promise<void>((resolve) => collabDoc.once("connected", () => resolve()));
    }
    console.log("Connected!");

    const start = Date.now();
    const newMap = collabDoc.createMap();
    root.set("newMap", newMap);

    const totalMessages = batches * batchSize;
    send(newMap, 0, batches, randomMessages);

    const resultsDeferred = new Deferred<any>();

    let sum = 0;
    newMap.on("op", (op, local) => {
        if (!local) {
            return;
        }

        if (op.contents.type === "set") {
            // console.log(Date.now() - op.contents.value.value);
            sum += Date.now() - op.contents.value.value.time;
        }

        // tslint:disable-next-line
        if (op.contents.key == totalMessages) {
            const totalTime = Date.now() - start;
            resultsDeferred.resolve({
                latency: sum / totalMessages,
                mbPerSecond: 1000 * totalMessages * payloadSize / (1024 * 1024) / totalTime,
                messagesPerSecond: 1000 * totalMessages / totalTime,
                totalTime,
            });
        }
    });

    return resultsDeferred.promise;
}
