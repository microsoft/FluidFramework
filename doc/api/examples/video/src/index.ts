import { api as prague, ui as pragueUi } from "@prague/routerlicious";
import * as jwt from "jsonwebtoken";
import { YouTubeVideoCanvas } from "./YouTubeVideoCanvas";

// For local development
// const routerlicious = "http://localhost:3000";
// const historian = "http://localhost:3001";
// const tenantId = "prague";
// const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
const routerlicious = "https://alfred.wu2.prague.office-int.com";
const historian = "https://historian.wu2.prague.office-int.com";
const tenantId = "gallant-hugle";
const secret = "03302d4ebfb6f44b662d00313aff5a46";

const documentId = window.location.search.slice(1) || "test-videoplayer-1";

// Register endpoint connection
prague.socketStorage.registerAsDefault(routerlicious, historian, tenantId);

async function run(id: string): Promise<void> {
    const token = jwt.sign(
        {
            documentId,
            permission: "read:write", // use "read:write" for now
            tenantId,
            user: {
                id: "test",
            },
        },
        secret);

    const host = new pragueUi.ui.BrowserContainerHost();

    // Load in the latest and connect to the document
    const collabDoc = await prague.api.load(id, { blockUpdateMarkers: true, token });
    const root = collabDoc.getRoot();

    const elem = document.getElementById("player-div") as HTMLDivElement;

    const ytCanvas = new YouTubeVideoCanvas(elem, collabDoc, root);
    host.attach(ytCanvas);
}

run(documentId).catch((error) => {
    console.error(error);
});
