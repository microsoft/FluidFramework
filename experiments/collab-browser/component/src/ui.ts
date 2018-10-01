import { IPlatform } from "../../../../routerlicious/packages/runtime-definitions";
import { Component } from "./component";

export class UI {
    private element: HTMLImageElement;
    private width = NaN;
    private height = NaN;

    public constructor(private readonly component: Component) {}

    public mount(context: IPlatform) {
        this.element = document.createElement("img");
        this.element.style.display = "block";
        context.queryInterface<(width: number, height: number) => void>("invalidateLayout").then((invalidateLayout) => {
            this.invalidateLayout = invalidateLayout || this.invalidateLayout;
            this.component.on("valueChanged", () => { this.update(); });
            this.update();
        });

        return this.element;
    }

    public update = async () => {
        const { image, width, height } = await this.component.getImage();
        if (image)  { this.element.src = image; }
        if (width)  { this.element.style.width = `${width}px`; }
        if (height) { this.element.style.height = `${height}px`; }

        if (width !== this.width || height !== this.height) {
            this.width = width;
            this.height = height;

            console.log(`    width: ${width}, height: ${height}`);
            this.invalidateLayout(width, height);
        }

        console.log(`*** UPDATE(${image}):`);
        console.log(`    ${this.element.outerHTML}`);
    }
    private invalidateLayout = (width: number, height: number) => { /* do nothing */ };
}
