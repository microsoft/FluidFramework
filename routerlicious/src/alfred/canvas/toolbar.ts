import * as utils from "./utils";

export class ToolBarButton {
    public el: HTMLElement;

    constructor(icon: string) {
        let urlParts = utils.parseURL(icon);
        this.el = <HTMLElement> document.createElement("button");
        this.el.id = urlParts.file;
        // tslint:disable-next-line:no-string-literal
        this.el["ToolBarButton"] = this;
        this.el.innerText = urlParts.file;
        this.el.style.backgroundImage = `url('${icon}')`;
        return this;
    }

    public icon(icon: string) {
        this.el.style.backgroundImage = `url('${icon}')`;
        return this;
    }

    public click(handler: EventListenerOrEventListenerObject) {
        this.el.addEventListener("click", handler);
        return this;
    }

    public elem() { return this.el; }
}
