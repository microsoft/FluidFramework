// The main app code
import { api, types } from "../client-api";
import * as ui from "../ui";
import { YouTubeVideo } from "./youtubeVideo";

/**
 * youtube video app
 */
export class YouTubeVideoCanvas extends ui.Component {
    public player: any;

    constructor(private elem: HTMLDivElement, doc: api.Document, root: types.IMap) {
        super(elem);
        this.player = null;
        window.onYouTubeIframeAPIReady = () => { this.onYouTubeIframeAPIReady(); };

        // this.elem = element;
        this.elem.addEventListener("YouTube-Loaded", (e) => {
            const video = new YouTubeVideo(document.createElement("div"),
                this.player,
                this.fetchVideoRoot(root, doc));
            this.addChild(video);
        });

        const playerDiv = document.createElement("div");
        playerDiv.id = "player";
        elem.appendChild(playerDiv);

        let tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        elem.appendChild(tag);
    }

    public onYouTubeIframeAPIReady() {
        let player = new window.YT.Player("player", {
            height: 390,
            playerVars: {
                autoplay: 0, // YT.AutoPlay.NoAutoPlay
                start: 0,
                },
            videoId: this.youtubeIdParser("https://www.youtube.com/watch?v=-Of_yz-4iXs"),
            width: 640,
        });
        this.player = player;
        this.elem.dispatchEvent(new Event("YouTube-Loaded"));
    }

    // TODO: Consider replacing this with "oembed"
    public youtubeIdParser(url: string): string {
        let regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#\&\?]*).*/;
        let match = url.match(regExp);
        return (match && match[7].length === 11) ? match[7] : null;
    }

    private fetchVideoRoot(root: types.IMap, doc: api.Document): Promise<types.IMap> {
        // TODO: Make sure the root.get promise works...
        root.has("youTubeVideo").then((hasVideo) => {
            if (!hasVideo) {
                root.set("youTubeVideo", doc.createMap());
            }
        });

        return root.get("youTubeVideo");
    }
}
