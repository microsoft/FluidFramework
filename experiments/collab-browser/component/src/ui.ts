import { Component } from "./component";

export class UI {
    private element: HTMLImageElement;

    public constructor(private readonly component: Component) {}

    public async mount() {
        this.element = document.createElement("img");

        this.component.on("valueChanged", () => { this.update(); });
        this.update();
        return this.element;
    }

    public update = async () => {
        const { image, width, height } = await this.component.getImage();
        if (image) { this.element.src = image; }
        if (width) { this.element.style.width = `${width}px`; }
        if (height) { this.element.style.height = `${height}px`; }

        console.log(`*** UPDATE(${image}):`);
        console.log(`    ${this.element.outerHTML}`);
    }
}
