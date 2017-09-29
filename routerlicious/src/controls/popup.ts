import * as ui from "../ui";

/**
 * Basic dock panel control
 */
export class Popup extends ui.Component {
    public bottom: ui.Component;
    public content: ui.Component;
    private visible = false;

    constructor(element: HTMLDivElement) {
        super(element);
        this.element.style.display = "none";
    }

    public addContent(content: ui.Component) {
        this.content = content;

        this.addChild(content);
        this.element.appendChild(content.element);
        this.resizeCore(this.size);
    }

    public toggle() {
        this.visible = !this.visible;
        this.element.style.display = this.visible ? "block" : "none";
    }

    public measure(size: ui.ISize): ui.ISize {
        return this.content ? this.content.measure(size) : size;
    }

    protected resizeCore(bounds: ui.Rectangle) {
        if (this.content) {
            this.content.resize(bounds);
        }
    }
}
