// The main app code
import * as api from "../api";
import * as ink from "../ink";
import * as ui from "../ui";
import InkCanvas from "./inkCanvas";

// const colors: ink.IColor[] = [
//     { r: 253 / 255, g:   0 / 255, b:  12 / 255, a: 1 },
//     { r: 134 / 255, g:   0 / 255, b:  56 / 255, a: 1 },
//     { r: 253 / 255, g: 187 / 255, b:  48 / 255, a: 1 },
//     { r: 255 / 255, g: 255 / 255, b:  81 / 255, a: 1 },
//     { r:   0 / 255, g:  45 / 255, b:  98 / 255, a: 1 },
//     { r: 255 / 255, g: 255 / 255, b: 255 / 255, a: 1 },
//     { r: 246 / 255, g:  83 / 255, b:  20 / 255, a: 1 },
//     { r:   0 / 255, g: 161 / 255, b: 241 / 255, a: 1 },
//     { r: 124 / 255, g: 187 / 255, b:   0 / 255, a: 1 },
//     { r:   8 / 255, g: 170 / 255, b:  51 / 255, a: 1 },
//     { r:   0 / 255, g:   0 / 255, b:   0 / 255, a: 1 },
// ];

/**
 * Canvas app
 */
export class Canvas extends ui.Component {
    private ink: InkCanvas;

    constructor(element: HTMLDivElement, model: ink.IInk, components: api.IMap) {
        super(element);

        // register all of the different handlers
        const hitPlane = document.createElement("div");
        element.appendChild(hitPlane);

        this.ink = new InkCanvas(hitPlane, model);

        // These should turn into components
        // document.querySelector("#replay").addEventListener("click", (e) => { this.ink.replay(); }, false);
        // const root = $("#color-picker");
        // for (const color of colors) {
        //     const cssColor = ui.toColorString(color);
        //     const elem = $(`<li><a class="color-choice" href="#" style="background-color: ${cssColor}" ></a></li>`);
        //     root.append(elem);
        //     elem.data("color", color);
        //     elem.click(() => {
        //         this.ink.setPenColor(elem.data("color"));
        //     });
        // }
    }

    protected resizeCore(bounds: ui.Rectangle) {
        bounds.conformElement(this.ink.element);
        this.ink.resize(bounds);
    }
}
