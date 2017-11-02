import * as ui from "../ui";

/**
 * Basic video player
 */
export class FlexVideo extends ui.Component {
    private message: HTMLSpanElement;
    private image: HTMLImageElement;
    private video: HTMLVideoElement;

    constructor(element: HTMLDivElement, vid: string, src: string) {
        super(element);
        console.log("D-FlexImage");
        this.message = document.createElement("span");
        this.message.style.height = "auto";
        this.message.style.height = "auto";
        this.message.style.padding = "5px";
        this.message.style.borderRadius = "8px";
        this.message.style.backgroundColor = "rgba(0, 240, 20, 0.5)";
        element.appendChild(this.message);

        this.image = document.createElement("img");
        console.log("image");
        this.image.src = src;
        this.image.alt = "Your Buddy!";
        element.appendChild(this.image);

        this.video = document.createElement("video");
        console.log("vid");
        this.video.src = vid;
        this.video.controls = true;
        this.video.width = 320;
        this.video.height = 240;
        this.video.autoplay = true;
        this.video.poster = "https://i.pinimg.com/originals/1b/2d/d0/1b2dd03413192c57f8a097969d67d861.jpg";
        element.appendChild(this.video);
    }

    public setMessage(message: string) {
        this.message.innerText = message;
    }

    public resizeCore(bounds: ui.Rectangle) {
        bounds.x = 0;
        bounds.y = 0;
        const overlayInnerRects = bounds.nipHoriz(Math.floor(bounds.width * 0.6));
        overlayInnerRects[0].conformElement(this.message);
        overlayInnerRects[1].conformElement(this.image);
    }
}
