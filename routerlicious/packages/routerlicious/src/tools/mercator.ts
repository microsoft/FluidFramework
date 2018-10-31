import * as api from "@prague/client-api";
import * as Map from "@prague/map";
import * as socketStorage from "@prague/socket-storage";
import * as commander from "commander";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import * as randomstring from "randomstring";

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
    payloadSize: number): Promise<void> {

    const str = randomstring.generate(payloadSize);

    // Register endpoint connection
    const documentServices = socketStorage.createDocumentService(routerlicious, historian);
    api.registerDocumentService(documentServices);

    const start = Date.now();
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

    const newMap = collabDoc.createMap();
    rootView.set("newMap", newMap);

    const totalMessages = batches * batchSize;
    send(newMap, 0, batches, batchSize, str);

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
            process.exit(0);
        }
    });

    console.log("Keys");
    console.log(rootView.keys());
}

// Process command line input
commander
    .version("0.0.1")
    .option("-b, --batches [batches]", "total messages", parseInt, 10)
    .option("-z, --batchSize [batchSize]", "batch size", parseInt, 1000)
    .option("-p, --payload [payload]", "payload size", parseInt,  1 * 1024)
    .option("-s, --server [server]", "server url", "http://localhost:3000")
    .option("-t, --storage [server]", "storage server url", "http://localhost:3001")
    .option("-o, --tenant [tenant]", "tenant ID", "prague")
    .option("-k, --key [key]", "key", "43cfc3fbf04a97c0921fd23ff10f9e4b")
    .parse(process.argv);

const runP = run(
    moniker.choose(),
    commander.tenant,
    commander.key,
    commander.server,
    commander.storage,
    commander.batches,
    commander.batchSize,
    commander.payload);
runP.catch((error) => {
    console.error(error);
});
