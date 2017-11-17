import { types } from "../client-api";
import * as ui from "../ui";

/**
 * Basic collaborative video player
 */
export class FlexVideo extends ui.Component {
    private video: HTMLVideoElement;
    private videoMapView: types.IMapView;
    private videoMap: types.IMap;

    constructor(element: HTMLDivElement, vid: string, private videoRoot: Promise<types.IMap>) {
        super(element);

        this.video = document.createElement("video");
        this.video.src = vid;
        this.video.controls = true;
        this.video.width = 320;
        this.video.height = 240;
        this.video.autoplay = false;
        this.video.poster = "https://i.pinimg.com/originals/1b/2d/d0/1b2dd03413192c57f8a097969d67d861.jpg";
        element.appendChild(this.video);

        this.setEventHandlers();
    }

    private async setEventHandlers() {
        this.videoMap = await this.videoRoot;
        this.videoMapView = await this.videoMap.getView();

        this.video.onplay = () => this.handlePlay();
        this.video.onpause = () => this.handlePause();
        this.video.ontimeupdate = () => this.handleTimeUpdate();
        this.video.onload = () => this.handleLoad();

        this.videoMap.on("valueChanged", async (changedValue) => {
            switch (changedValue.key) {
                case("play"):
                    this.updatePlay(this.videoMapView.get(changedValue.key));
                    break;
                case("time"):
                   this.updateTime(this.videoMapView.get(changedValue.key));
                    break;
                default:
                    console.log("default: " + changedValue.key);
                    break;
            }
        });
    }

    private updatePlay(play: boolean) {
        if (play) {
            if (this.video.paused) {
                this.video.play();
            }
        } else {
            if (!this.video.paused) {
                this.video.pause();
            }
        }
    }

    private updateTime(time: number) {
        if (Math.abs(this.video.currentTime - time) > 2) {
            this.video.currentTime = time;
        }
    }

    private handleLoad() {
        this.videoMap.get("time").then((time) => {
            this.video.currentTime = time;
        });
        this.videoMap.get("play").then((play) => {
            this.updatePlay(play);
        });
    }

    private handleTimeUpdate() {
        this.videoMap.set("time", this.video.currentTime);
    }

    private handlePlay() {
        this.videoMap.set("play", true);
    }

    private handlePause() {
        this.videoMap.set("play", false);
    }
}
