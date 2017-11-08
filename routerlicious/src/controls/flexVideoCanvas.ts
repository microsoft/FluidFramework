// The main app code
import { api, types } from "../client-api";
import * as ui from "../ui";
// import { Button } from "./button";
import { DockPanel } from "./dockPanel";
import { FlexVideo } from "./flexVideo";

/**
 * Canvas app
 */
export class FlexVideoCanvas extends ui.Component {
    private dock: DockPanel;
    private video: FlexVideo;
    // private playPause: Button;
    // private videoMap: types.IMap;
    // private videoMapView: types.IMapView;

    constructor(element: HTMLDivElement, doc: api.Document, root: types.IMap) {
        super(element);

        const iFrame = document.createElement("div");
        element.appendChild(iFrame);
        this.video = new FlexVideo(iFrame,
            "http://video.webmfiles.org/big-buck-bunny_trailer.webm",
            this.fetchVideoRoot(root, doc));
        this.addChild(this.video);

        const dockElement = document.createElement("div");
        element.appendChild(dockElement);
        this.dock = new DockPanel(dockElement);
        this.addChild(this.dock);
    }

    private fetchVideoRoot(root: types.IMap, doc: api.Document): Promise<types.IMap> {
        // TODO: Make sure the root.get promise works...
        root.has("video").then((hasVideo) => {
            if (!hasVideo) {
                root.set("video", doc.createMap());
            }
        });

        return root.get("video");
    }
}
