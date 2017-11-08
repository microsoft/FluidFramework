import { types } from "../client-api";
import * as ui from "../ui";

/**
 * Basic video player
 */
export class FlexVideo extends ui.Component {
    private message: HTMLSpanElement;
    private image: HTMLImageElement;
    private video: HTMLVideoElement;
    private videoMap: types.IMap;
    private videoMapView: types.IMapView;

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

        this.videoRoot.then((video) => {
            console.log(video);
            console.log(videoRoot);

            this.videoMap = video;
            this.videoMap.getView().then( (videoMapView) => {
                this.videoMapView = videoMapView;
            });
            console.log(video);
            console.log(this.videoMap);
            this.video.onplay = () => this.handlePlay();
            this.video.onpause = () => this.handlePause(); // emit play = false
            this.video.ontimeupdate = () => this.handleTimeUpdate();
            this.video.onload = () => this.handleLoad();

            this.videoMap.get("time").then((time) => {
                console.log("setting time");
                this.video.currentTime = time;
            });
            this.videoMap.get("play").then((play) => {
                console.log("setting play");
                this.playPause(play);
            });

            this.videoMap.on("valueChanged", async (changedValue) => {
                console.log("flexVideoConstructor: Recieved value changed event");
                console.log(changedValue);
                console.log(this.videoMap.get(changedValue.key));
                console.log(this.videoMap);
                // this.videoMap.get(changedValue.key).then((play) => {
                //     this.playPause(play);
                // });
                switch (changedValue.key) {
                    case("play"):
                        console.log("Switch:play");
                        this.videoMap.get(changedValue.key).then((play) => this.playPause(play));
                        break;
                    case("time"):
                        this.videoMap.get(changedValue.key).then((time) => this.timeUpdate(time));
                        break;
                    default:
                        console.log("default case " + changedValue.key);
                        break;
                }
            });
        });
    }

    public resizeCore(bounds: ui.Rectangle) {
        bounds.x = 0;
        bounds.y = 0;
        const overlayInnerRects = bounds.nipHoriz(Math.floor(bounds.width * 0.6));
        overlayInnerRects[0].conformElement(this.message);
        overlayInnerRects[1].conformElement(this.image);
    }

    public playPause(play: boolean) {
        if (play) {
            console.log("play");
            if (this.video.paused) {
                this.video.play();
            }
        } else {
            console.log("pause");
            if (!this.video.paused) {
                this.video.pause();
            }
        }
    }

    public timeUpdate(time: number) {
        if (Math.abs(this.video.currentTime - time) > 2) {
            this.video.currentTime = time;
        }
    }

    private handleLoad() {
        this.videoMap.get("time").then((time) => {
            this.video.currentTime = time;
        });
        this.videoMap.get("play").then((play) => {
            this.playPause(play);
        });
    }

    private handleTimeUpdate() {
        this.videoMap.set("time", this.video.currentTime);
    }

    private handlePlay() {
        console.log("handlePlay");
        this.videoMap.set("play", true);
    }

    private handlePause() {
        console.log("handlePause");
        this.videoMap.set("play", false);
    }
}
