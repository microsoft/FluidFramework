import * as api from "@prague/client-api";
import * as Map from "@prague/map";
import * as socketStorage from "@prague/socket-storage";
import { Deferred } from "@prague/utils";
import * as jwt from "jsonwebtoken";
import * as randomstring from "randomstring";
import { getRandomName } from "./../../utils/dockerNames";

function send(map: Map.IMap, index: number, total: number, setLength: number, str: string) {
    for (let i = 0; i < setLength; i++) {
        map.set("" + (index * setLength + i), { time: Date.now(), str });
    }

    if (index <= total) {
        // Starting with setTimeout - will upgrade to immediate
        setTimeout(
            () => {
                send(map, index + 1, total, setLength, str);
            },
            0);
    }
}

async function run(
    id: string,
    tenantId: string,
    secret: string,
    routerlicious: string,
    historian: string,
    batches: number,
    batchSize: number,
    payloadSize: number): Promise<any> {

    const str = randomstring.generate(payloadSize);

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

    // Load in the latest and connect to the document
    const tokenThing = new socketStorage.TokenProvider(token);
    const collabDoc = await api.load(id, tenantId, { id: "test" }, tokenThing, { blockUpdateMarkers: true, token });
    const rootView = await collabDoc.getRoot().getView();
    if (!collabDoc.isConnected) {
        await new Promise<void>((resolve) => collabDoc.once("connected", () => resolve()));
    }
    console.log("Connected!");

    const start = Date.now();
    const newMap = collabDoc.createMap();
    rootView.set("newMap", newMap);

    const totalMessages = batches * batchSize;
    send(newMap, 0, batches, batchSize, str);

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
            console.log("Total Time", totalTime);
            console.log("Latency", sum / totalMessages);
            console.log("Bandwidth", 1000 * totalMessages / totalTime);

            resultsDeferred.resolve({
                bandwidth: 1000 * totalMessages / totalTime,
                latency: sum / totalMessages,
                totalTime,
            });
        }
    });

    return resultsDeferred.promise;
}

export function initialize() {
    document.getElementById("run").onclick = async (ev) => {
        const batches = Number.parseInt((document.getElementById("batches") as HTMLInputElement).value, 10);
        const messagesPerBatch = Number.parseInt((document.getElementById("batchSize") as HTMLInputElement).value, 10);
        const payloadSize = Number.parseInt((document.getElementById("payload") as HTMLInputElement).value, 10);
        console.log(batches, messagesPerBatch, payloadSize);

        const newElement = document.createElement("tr");
        const th = document.createElement("th");
        th.innerText = `${batches} batches @ ${messagesPerBatch} messages per batch`;
        th.scope = "row";
        const sioTd = document.createElement("td");
        const sioLocalTd = document.createElement("td");
        const wsTd = document.createElement("td");
        const wsLocalTd = document.createElement("td");
        newElement.appendChild(th);
        newElement.appendChild(sioTd);
        newElement.appendChild(sioLocalTd);
        newElement.appendChild(wsTd);
        newElement.appendChild(wsLocalTd);

        document.getElementById("output").appendChild(newElement);

        const sioresults = await run(
            getRandomName(),
            "prague",
            "43cfc3fbf04a97c0921fd23ff10f9e4b",
            "http://localhost:3000",
            "http://localhost:3001",
            batches,
            messagesPerBatch,
            payloadSize);
        sioTd.innerText = "SIO" + JSON.stringify(sioresults, null, 2);

        const sioLocalResults = await run(
            getRandomName(),
            "local",
            "43cfc3fbf04a97c0921fd23ff10f9e4b",
            "http://localhost:3000",
            "http://localhost:3001",
            batches,
            messagesPerBatch,
            payloadSize);
        sioLocalTd.innerText = "SIO Local" + JSON.stringify(sioLocalResults, null, 2);

        const wsresults = await run(
            getRandomName(),
            "prague",
            "43cfc3fbf04a97c0921fd23ff10f9e4b",
            "http://localhost:3030",
            "http://localhost:3001",
            batches,
            messagesPerBatch,
            payloadSize);
        wsTd.innerText = "WS" + JSON.stringify(wsresults, null, 2);

        const wsLocalResults = await run(
            getRandomName(),
            "local",
            "43cfc3fbf04a97c0921fd23ff10f9e4b",
            "http://localhost:3030",
            "http://localhost:3001",
            batches,
            messagesPerBatch,
            payloadSize);
        wsLocalTd.innerText = "WS Local" + JSON.stringify(wsLocalResults, null, 2);
    };
}
