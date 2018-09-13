import { api } from "@prague/client-api";
import * as socketStorage from "@prague/socket-storage";
import * as jwt from "jsonwebtoken";
import { Pinpoint } from "pinpoint";

// For local development
const routerlicious = "http://localhost:3000";
const historian = "http://localhost:3001";
const tenantId = "prague";
const secret = "43cfc3fbf04a97c0921fd23ff10f9e4b";
// const routerlicious = "https://alfred.wu2.prague.office-int.com";
// const historian = "https://historian.wu2.prague.office-int.com";
// const tenantId = "gallant-hugle";
// const secret = "03302d4ebfb6f44b662d00313aff5a46";

const documentId = "test-sequence-0831-1";
let pinpoint: Pinpoint;

// Register endpoint connection
const documentServices = socketStorage.createDocumentService(routerlicious, historian);
api.registerDocumentService(documentServices);

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

    // Load in the latest and connect to the document
    const collabDoc = await api.load(id, { blockUpdateMarkers: true, token });

    const rootView = await collabDoc.getRoot().getView();
    console.log("Keys");
    console.log(rootView.keys());

    // Add in the text string if it doesn't yet exist
    if (!collabDoc.existing) {
        const data = {
            "aspect-ratio": "tall",
            "dek": "This is a test map.",
            "el": ".test-map",
            "hed": "The U.K. and France",
            "lat": 51.5049378,
            "lon": - 0.0870377,
            "markers": [{
                "icon": "square",
                "label": "plain",
                "label-direction": "north",
                "labelDirection": "north",
                "lat": 51.5049378,
                "lon": - 0.0870377,
                "text": "",
            }],
            "minimap": true,
            "minimap-zoom-offset": -5,
            "note": "This is a note.",
            "zoom": 4,
        };
        rootView.set("map", data);
    } else {
        await rootView.wait("map");
    }

    const mapHost = document.getElementById("map-host") as HTMLElement;
    mapHost.innerHTML = "<div class='test-map' style='width: 300px;'></div>";

    collabDoc.getRoot().on(
        "valueChanged",
        () => {
            const updatedDetails = rootView.get("map");
            pinpoint.remove();
            mapHost.innerHTML = "<div class='test-map' style='width: 300px;'></div>";
            pinpoint = new Pinpoint(updatedDetails);
        });

    const mapDetails = rootView.get("map");
    pinpoint = new Pinpoint(mapDetails);

    collabDoc.once("connected", () => {
        const connectedDetails = rootView.get("map");
        connectedDetails.zoom = (connectedDetails.zoom + 1) % 10 + 5;
        connectedDetails.minimap = true;
        connectedDetails["minimap-zoom-offset"] = -5;
        rootView.set("map", connectedDetails);
    });
}

run(documentId).catch((error) => {
    console.error(error);
});
