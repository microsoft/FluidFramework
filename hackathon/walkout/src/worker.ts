import { api as prague } from "@prague/routerlicious";
import * as jwt from "jsonwebtoken";
import * as process from "process";
import { IHook } from "./github";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "heuristic-kepler";
const secret = "f9349c025fc7e98d9b8cdec6bbe4320e";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

class StreamManager {
    private inbound = Array<{ event: string, hook: IHook }>();
    private stream: prague.types.IStream;

    public attachStream(stream: prague.types.IStream) {
        this.stream = stream;

        for (const message of this.inbound) {
            this.appendCore(message);
        }
        this.inbound = null;
    }

    public append(message: { event: string, hook: IHook }) {
        if (this.stream) {
            this.appendCore(message);
        } else {
            this.inbound.push(message);
        }
    }

    private appendCore(message: { event: string, hook: IHook }) {
        const extendedPen = {
            color: null,
            event: message.event,
            hook: message.hook,
            thickness: 0,
        };
        const delta = new prague.types.Delta().stylusDown(
            { x: 0, y: 0 },
            0,
            extendedPen);

        this.stream.submitOp(delta);
    }
}

async function run(id: string): Promise<void> {
    const streamManager = new StreamManager();

    // listen for inbound messages
    process.on("message", (message) => {
        streamManager.append(message);
    });

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
    streamManager.attachStream(stream);

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

run(process.argv[2]).catch(
    (error) => {
        console.error(error);
    });
