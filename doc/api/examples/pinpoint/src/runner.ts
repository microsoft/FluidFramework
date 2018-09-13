import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { Pinpoint } from "pinpoint";
import { Chaincode } from "./chaincode";
import { Document } from "./document";

class Runner {
    public async run(collabDoc: Document, platform: IPlatform) {
        const mapHost: HTMLElement = platform ? platform.queryInterface<HTMLElement>("div") : null;
        if (!mapHost) {
            return;
        }

        const innerDiv = document.createElement("div");
        innerDiv.style.width = "300px";
        mapHost.appendChild(innerDiv);

        const rootView = await collabDoc.getRoot().getView();
        console.log("Keys");
        console.log(rootView.keys());

        // Add in the text string if it doesn't yet exist
        if (!collabDoc.existing) {
            const data = {
                "aspect-ratio": "tall",
                "dek": "This is a test map.",
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

        const mapDetails = rootView.get("map");
        mapDetails.element = innerDiv;
        let pinpoint = new Pinpoint(mapDetails);

        collabDoc.getRoot().on(
            "valueChanged",
            () => {
                const updatedDetails = rootView.get("map");
                pinpoint.remove();
                innerDiv.style.width = "300px";
                updatedDetails.element = innerDiv;
                pinpoint = new Pinpoint(updatedDetails);
            });

        collabDoc.runtime.once("connected", () => {
            const connectedDetails = rootView.get("map");
            connectedDetails.zoom = (connectedDetails.zoom + 1) % 10 + 5;
            connectedDetails.minimap = true;
            connectedDetails["minimap-zoom-offset"] = -5;
            rootView.set("map", connectedDetails);
        });
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
