import { controls, ui } from "@prague/client-ui";
import { IMap } from "@prague/map";
import { IChaincode, IPlatform } from "@prague/runtime-definitions";
import { Chaincode } from "./chaincode";
import { Document } from "./document";

class Runner {
    public async run(collabDoc: Document, platform: IPlatform) {
        const hostContent: HTMLElement = platform ? platform.queryInterface<HTMLElement>("div") : null;
        if (!hostContent) {
            // If headless exist early
            return;
        }

        const content = document.createElement("div");
        hostContent.appendChild(content);

        const host = new ui.BrowserContainerHost();
        
        const root = collabDoc.getRoot();

        // Create our distributed Map, called "youTubeVideo", on the root map
        if (collabDoc.existing) {
            await root.set<IMap>("youTubeVideo", collabDoc.createMap());
        }

        const videoMap = await root.wait<IMap>("youTubeVideo");
        
        const canvas = new controls.YouTubeVideoCanvas(hostContent, videoMap);
        host.attach(canvas);
    }
}

export async function instantiate(): Promise<IChaincode> {
    // Instantiate a new runtime per code load. That'll separate handlers, etc...
    const chaincode = new Chaincode(new Runner());
    return chaincode;
}
