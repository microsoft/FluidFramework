// tslint:disable:align whitespace no-trailing-whitespace
import * as request from "request";
import * as url from "url";
import * as API from "../../api";
import { MergeTreeChunk } from "../../api";
import * as SharedString from "../../merge-tree";
import * as socketStorage from "../../socket-storage";
import * as FlowView from "./flowView";
import * as Geometry from "./geometry";

socketStorage.registerAsDefault(document.location.origin);

// first script loaded
let clockStart = Date.now();

export let theFlow: FlowView.FlowView;

class FlowContainer implements FlowView.IComponentContainer {
    public onresize: () => void;

    constructor(public div: HTMLDivElement) {
        window.addEventListener("resize", () => {
            if (this.onresize) {
                this.onresize();
            }
        });
    }
}

function createContainer() {
    let containerDiv = document.createElement("div");
    let container = new FlowContainer(containerDiv);
    let bodBounds = document.body.getBoundingClientRect();
    Geometry.Rectangle.conformElementToRect(containerDiv, Geometry.Rectangle.fromClientRect(bodBounds));
    document.body.appendChild(containerDiv);
    return container;
}

export async function onLoad(id: string) {
    const extension = API.defaultRegistry.getExtension(SharedString.CollaboritiveStringExtension.Type);
    const sharedString = extension.load(id, API.getDefaultServices(), API.defaultRegistry) as SharedString.SharedString;

    // Retrive any stored insights
    const mapExtension = API.defaultRegistry.getExtension(API.MapExtension.Type);
    const insights = mapExtension.load(`${id}-insights`, API.getDefaultServices(), API.defaultRegistry) as API.IMap;

    sharedString.on("partialLoad", async (data: MergeTreeChunk) => {
        console.log("Partial load fired");

        let container = createContainer();
        theFlow = new FlowView.FlowView(sharedString, data.totalSegmentCount,
            data.totalLengthChars, container, insights);
        if (data.totalLengthChars > 0) {
            theFlow.render(0, true);
        }
        theFlow.timeToEdit = theFlow.timeToImpression = Date.now() - clockStart;
        theFlow.setEdit();
    });

    sharedString.on("loadFinshed", (data: MergeTreeChunk) => {
        if (sharedString.client.getLength() !== 0) {
            theFlow.loadFinished(clockStart);
        } else {
            console.log("local load...");
            request.get(url.resolve(document.baseURI, "/public/literature/pp.txt"), (error, response, body: string) => {
                if (error) {
                    return console.error(error);
                }
                const segments = SharedString.loadSegments(body, 0);
                for (const segment of segments) {
                    sharedString.insertText((<SharedString.TextSegment>segment).text, sharedString.client.getLength());
                }
                theFlow.loadFinished(clockStart);
            });
        }
    });
}
