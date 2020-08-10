/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObject } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { IColor, IInk, Ink, InkCanvas } from "@fluidframework/ink";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";
// eslint-disable-next-line import/no-unassigned-import
import "./style.less";

const colorPickerColors: IColor[] = [
    { r: 253, g: 0, b: 12, a: 1 },
    { r: 134, g: 0, b: 56, a: 1 },
    { r: 253, g: 187, b: 48, a: 1 },
    { r: 255, g: 255, b: 81, a: 1 },
    { r: 0, g: 45, b: 98, a: 1 },
    { r: 255, g: 255, b: 255, a: 1 },
    { r: 246, g: 83, b: 20, a: 1 },
    { r: 0, g: 161, b: 241, a: 1 },
    { r: 124, g: 187, b: 0, a: 1 },
    { r: 8, g: 170, b: 51, a: 1 },
    { r: 0, g: 0, b: 0, a: 1 },
];

export class Canvas extends DataObject implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private ink: IInk;
    private inkCanvas: InkCanvas;
    private inkColorPicker: HTMLDivElement;

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        elm.appendChild(this.createCanvasDom());
        this.sizeCanvas();

        window.addEventListener("resize", this.sizeCanvas.bind(this));
    }

    protected async initializingFirstTime() {
        this.root.set("pageInk", Ink.create(this.runtime).handle);
    }

    protected async hasInitialized() {
        // Wait here for the ink
        const handle = await this.root.wait<IFluidHandle<IInk>>("pageInk");
        this.ink = await handle.get();
    }

    private createCanvasDom() {
        const inkComponentRoot = document.createElement("div");
        inkComponentRoot.classList.add("ink-component-root");

        const inkSurface = document.createElement("div");
        inkSurface.classList.add("ink-surface");

        const canvasElement = document.createElement("canvas");
        canvasElement.classList.add("ink-canvas");

        this.inkCanvas = new InkCanvas(canvasElement, this.ink);

        const inkToolbar = this.createToolbar();

        inkComponentRoot.appendChild(inkSurface);
        inkSurface.appendChild(canvasElement);
        inkSurface.appendChild(inkToolbar);

        this.inkColorPicker = this.createColorPicker();

        inkComponentRoot.appendChild(this.inkColorPicker);

        return inkComponentRoot;
    }

    private createToolbar() {
        const inkToolbar = document.createElement("div");
        inkToolbar.classList.add("ink-toolbar");

        const colorButton = document.createElement("button");
        colorButton.classList.add("ink-toolbar-button", "fluid-icon-pencil");
        colorButton.addEventListener("click", this.toggleColorPicker.bind(this));

        const replayButton = document.createElement("button");
        replayButton.classList.add("ink-toolbar-button", "fluid-icon-replay");
        replayButton.addEventListener("click", this.inkCanvas.replay.bind(this.inkCanvas));

        const clearButton = document.createElement("button");
        clearButton.classList.add("ink-toolbar-button", "fluid-icon-cross");
        clearButton.addEventListener("click", this.inkCanvas.clear.bind(this.inkCanvas));

        inkToolbar.appendChild(colorButton);
        inkToolbar.appendChild(replayButton);
        inkToolbar.appendChild(clearButton);

        return inkToolbar;
    }

    private createColorPicker() {
        const inkColorPicker = document.createElement("div");
        inkColorPicker.classList.add("ink-color-picker");

        for (const color of colorPickerColors) {
            inkColorPicker.appendChild(this.createColorOption(color));
        }

        return inkColorPicker;
    }

    private createColorOption(color: IColor) {
        const inkColorOption = document.createElement("button");
        inkColorOption.classList.add("ink-color-option");
        inkColorOption.style.backgroundColor = `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;

        inkColorOption.addEventListener("click", () => {
            this.inkCanvas.setPenColor(color);
            this.toggleColorPicker();
        });

        return inkColorOption;
    }

    private toggleColorPicker() {
        this.inkColorPicker.classList.toggle("show");
    }

    private sizeCanvas() {
        this.inkCanvas.sizeCanvasBackingStore();
    }
}
