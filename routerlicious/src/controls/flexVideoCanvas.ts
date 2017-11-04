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
    private playPause: Button;

    constructor(element: HTMLDivElement, docd: api.Document, root: types.IMapView) {
        super(element);

        const iFrame = document.createElement("div");
        element.appendChild(iFrame);
        this.video = new FlexVideo(iFrame,
            "http://video.webmfiles.org/big-buck-bunny_trailer.webm");
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
        this.playPause.element.id = "button";
        this.playPause.resize(buttonRect);

        this.playPause.on("click", (event) => {
            debug("play pause clicked");
            this.video.playPause();
        });
        this.addChild(this.playPause);
    }
}
