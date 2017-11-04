import * as ui from "../ui";

/**
 * Basic video player
 */
export class FlexVideo extends ui.Component {
    private message: HTMLSpanElement;
    private image: HTMLImageElement;
    private video: HTMLVideoElement;
    private playing: boolean;

    constructor(element: HTMLDivElement, vid: string) {
        super(element);

        this.video = document.createElement("video");
        this.video.src = vid;
        this.video.controls = false;
        this.video.width = 320;
        this.video.height = 240;
        this.video.autoplay = true;
        this.video.poster = "https://i.pinimg.com/originals/1b/2d/d0/1b2dd03413192c57f8a097969d67d861.jpg";
        element.appendChild(this.video);

        this.video.onplay = ( (onplay) => {
            this.playing = true;
            console.log("a");
        });
        this.video.onpause = ( (onpause) => {
            this.playing = false;
            console.log("b");
        });
    }

    public resizeCore(bounds: ui.Rectangle) {
        bounds.x = 0;
        bounds.y = 0;
        const overlayInnerRects = bounds.nipHoriz(Math.floor(bounds.width * 0.6));
        overlayInnerRects[0].conformElement(this.message);
        overlayInnerRects[1].conformElement(this.image);
    }

    public playPause() {
        if (this.playing) {
            this.video.pause();
        } else {
            this.video.play();
        }
    }
}
