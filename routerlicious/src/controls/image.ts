import * as ui from "../ui";

export class Image extends ui.Component {
    private message: HTMLSpanElement;
    private image: HTMLImageElement;

    constructor(element: HTMLDivElement, src: string) {
        super(element);

        this.message = document.createElement("span");
        this.message.style.height = "auto";
        this.message.style.height = "auto";
        this.message.style.padding = "5px";
        this.message.style.borderRadius = "8px";
        this.message.style.backgroundColor = "rgba(0, 240, 20, 0.5)";
        this.message.style.visibility = "visible";
        element.appendChild(this.message);

        this.image = document.createElement("img");
        this.image.src = src;
        this.image.alt = "Your Buddy!";
        element.appendChild(this.image);
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
