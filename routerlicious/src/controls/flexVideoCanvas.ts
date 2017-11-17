// The main app code
import { api, types } from "../client-api";
import * as ui from "../ui";
import { FlexVideo } from "./flexVideo";

/**
 * flex video app
 */
export class FlexVideoCanvas extends ui.Component {
    private video: FlexVideo;

    constructor(element: HTMLDivElement, doc: api.Document, root: types.IMap) {
        super(element);

        const videoFrame = document.createElement("div");
        element.appendChild(videoFrame);

        this.video = new FlexVideo(videoFrame,
            "http://video.webmfiles.org/big-buck-bunny_trailer.webm",
            this.fetchVideoRoot(root, doc));
        this.addChild(this.video);
    }

    private async fetchVideoRoot(root: types.IMap, doc: api.Document): Promise<types.IMap> {
        const hasVideo = await root.has("video");

        if (!hasVideo) {
            root.set("video", doc.createMap());
        }
        return root.get("video");
    }
}
