// The main app code
import { api, types } from "../client-api";
import * as ui from "../ui";
import { Button } from "./button";
import { debug } from "./debug";

import { DockPanel } from "./dockPanel";
import { FlexVideo } from "./flexVideo";

/**
 * Canvas app
 */
export class FlexVideoCanvas extends ui.Component {
    private dock: DockPanel;
    private video: FlexVideo;

    constructor(element: HTMLDivElement, doc: api.Document, root: types.IMapView) {
        super(element);

        const iFrame = document.createElement("div");
        element.appendChild(iFrame);
        this.video = new FlexVideo(iFrame,
            "http://video.webmfiles.org/big-buck-bunny_trailer.webm",
            "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Balloons-aj.svg/1200px-Balloons-aj.svg.png");
        this.addChild(this.video);

        const dockElement = document.createElement("div");
        element.appendChild(dockElement);
        this.dock = new DockPanel(dockElement);
        this.addChild(this.dock);

        const buttonSize = { width: 50, height: 50 };
        const playPause = new Button(
            document.createElement("div"),
            buttonSize,
            ["btn", "btn-palette", "prague-icon-pencil"]);
        playPause.on("click", (event) => {
            debug("play pause clicked");
            this.video.playPause();
        });
    }
}
