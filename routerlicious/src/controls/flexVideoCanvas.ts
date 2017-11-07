// The main app code
import { api, types } from "../client-api";
import * as ui from "../ui";
import { Button } from "./button";
import { DockPanel } from "./dockPanel";
import { FlexVideo } from "./flexVideo";

/**
 * Canvas app
 */
export class FlexVideoCanvas extends ui.Component {
    private dock: DockPanel;
    private video: FlexVideo;
    private playPause: Button;
    private videoMap: types.IMap;
    private videoMapView: types.IMapView;

    constructor(element: HTMLDivElement, doc: api.Document, root: types.IMap) {
        super(element);

        // The root does not have "video" as a key if the keys are enumerated
        if (!root.has("video") ) {
            root.set("video", doc.createMap());
            console.log("VideoCanvasConstructor: Root does NOT HAVE video");
        } else {
            // Expected: Promise returning undefined
            console.log(root.get("video"));

            root.get("video").then((video) => {
                console.log(video);
                console.log(this.videoMap);
                this.videoMap = video;
                console.log(this.videoMap);
                this.getMappedData();
            });
            // Expected: Promise returning a collaborative map
            console.log(root.get("video"));
        }

        // this.getMappedData(root);

        const iFrame = document.createElement("div");
        element.appendChild(iFrame);
        this.video = new FlexVideo(iFrame,
            "http://video.webmfiles.org/big-buck-bunny_trailer.webm",
            root);

        this.addChild(this.video);

        const dockElement = document.createElement("div");
        element.appendChild(dockElement);
        this.dock = new DockPanel(dockElement);
        this.addChild(this.dock);

        const buttonSize = { width: 50, height: 50 };
        const buttonRect = new ui.Rectangle(75, 75, 100, 100);
        const buttonContainer = document.createElement("div");
        element.appendChild(buttonContainer);

        this.playPause = new Button(
            buttonContainer,
            buttonSize,
            ["btn", "btn-palette", "prague-icon-pencil"]);
        this.playPause.resize(buttonRect);

        this.playPause.on("click", (event) => {
            this.playPauseHandler(root);
        });
        this.addChild(this.playPause);
    }

    // This function triggers the valueChanged event due to the emit on line 197 of map.ts
    // The set function triggers this emit
    private async playPauseHandler(root: types.IMap) {
        console.log("Play Pause Handler");

        // Does not trigger valueChanged Event
        let rand: number = Math.random();
        this.videoMap.set("newValue", rand);

        // Does trigger valueChanged event
        let videoMapFromRoot = await root.get("video") as types.IMap;
        videoMapFromRoot.set("newValue2", rand);
        root.set("video", videoMapFromRoot);
        console.log(videoMapFromRoot);
        console.log(root);
        console.log(this.videoMap);

        // videoMap.get returns the random value... this value is also visible in the deduped
        // message from the api-core debug statements, however the following values are problematic:
        /*
        minimumSequenceNumber == referenceSequenceNumber == 700's
        sequenceNumber == 200's
        clientSequenceNumber == 0-50
        */
        let val = await this.videoMap.get("newValue");
        console.log(val);

        // this view.get sometimes gets undefined. I believe this happens when the
        // client isn't connected to the server properly
        let valView = this.videoMapView.get("newValue");
        console.log(valView);
    }

    // tslint:disable-next-line:member-ordering
    public async getMappedData() {
        console.log("Get Mapped Data");
        // this.videoMap = await root.get("video") as types.IMap;
        console.log(this.videoMap);
        let val = await this.videoMap.get("newValue");
        console.log(val);

        console.log("Get MapView Data");
        this.videoMapView = await this.videoMap.getView();

        let vala = this.videoMapView.get("newValue");
        console.log(vala);
    }
}
