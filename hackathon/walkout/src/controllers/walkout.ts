import { api as prague } from "@prague/routerlicious";
import * as jwt from "jsonwebtoken";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "heuristic-kepler";
const secret = "f9349c025fc7e98d9b8cdec6bbe4320e";
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

async function run(id: string): Promise<void> {
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
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true, token });
    const rootView = await collabDoc.getRoot().getView();

    // Add in the text string if it doesn't yet exist
    if (!collabDoc.existing) {
        rootView.set("messages", collabDoc.createStream());
    } else {
        await rootView.wait("messages");
    }

    // Load the text string and listen for updates
    const stream = rootView.get("messages") as prague.types.IStream;

    console.log("From snapshot");
    const layers = stream.getLayers();
    for (const layer of layers) {
        for (const operation of layer.operations) {
            if (operation.stylusDown) {
                const rawPen = operation.stylusDown.pen as any;
                console.log(`${rawPen.event}: ${JSON.stringify(rawPen.hook.pusher)}`);
            }
        }
    }

    console.log("Listening inbound");
    stream.on("op", (op) => {
        const delta = op.contents as prague.types.IDelta;
        for (const operation of delta.operations) {
            if (operation.stylusDown) {
                const rawPen = operation.stylusDown.pen as any;
                console.log(`${rawPen.event}: ${JSON.stringify(rawPen.hook.pusher)}`);
            }
        }
    });
}

export function load(id: string) {
    run(id).catch(
        (error) => {
            console.error(error);
        });
}
