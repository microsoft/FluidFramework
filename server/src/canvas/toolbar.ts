/// <reference path="utils.ts"/>

class ToolBarButton {
    el : HTMLElement;

    constructor(icon : string) {
        var urlParts = parseURL(icon); 
        this.el = <HTMLElement>document.createElement('button');
        this.el.id = urlParts.file;
        this.el["ToolBarButton"] = this;
        this.el.innerText = urlParts.file;
        this.el.style.backgroundImage = "url('"+icon+"')";
        return this;
    }

    icon(icon: string) {
        this.el.style.backgroundImage = "url('"+icon+"')";
        return this;
    }

    click(handler: EventListenerOrEventListenerObject) {
        this.el.addEventListener('click', handler);
        return this;
    }

    elem() { return this.el;}
}