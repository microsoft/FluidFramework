import { api as prague } from "@prague/routerlicious";
import { Deferred } from "@prague/routerlicious/dist/core-utils";
import * as utils from "@prague/routerlicious/dist/utils";
import * as jwt from "jsonwebtoken";
import * as winston from "winston";

const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "gallant-hugle";
const secret = "03302d4ebfb6f44b662d00313aff5a46";

const documentId = "test-sequence-0507-1";

// Register endpoint connection
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

    winston.info(`Running`);
    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true, token });

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    // Load the text string and listen for updates
    const text = rootView.get("text");

    // Update the text after being loaded as well as when receiving ops
    text.loaded.then(() => {
        winston.info(`Text loaded`);
    });
    text.on("op", (msg) => {
        winston.info(`op received`);
    });
}

// TODO: Need to call workerservice here.
export class AugLoopRunner implements utils.IRunner {
    private running = new Deferred<void>();

    public start(): Promise<void> {
        winston.info(`Will run now`);
        run(documentId).then(() => this.running.resolve(), (error) => this.running.reject(error));

        return this.running.promise;
    }
    public stop(): Promise<void> {
        return this.running.promise;
    }
}
