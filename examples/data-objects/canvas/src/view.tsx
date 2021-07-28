/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IColor, InkCanvas } from "@fluidframework/ink";
import { IFluidHTMLOptions, IFluidHTMLView } from "@fluidframework/view-interfaces";

import React, { useState } from "react";

import { Canvas } from "./canvas";
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

export class CanvasView implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private readonly canvasElement: HTMLCanvasElement;
    private inkColorPicker: HTMLDivElement;
    private readonly inkCanvas: InkCanvas;

    public constructor(canvas: Canvas) {
        this.canvasElement = document.createElement("canvas");
        this.inkCanvas = new InkCanvas(this.canvasElement, canvas.ink);
    }

    public render(elm: HTMLElement, options?: IFluidHTMLOptions): void {
        elm.appendChild(this.createCanvasDom());
        this.sizeCanvas();

        window.addEventListener("resize", this.sizeCanvas.bind(this));
    }

    private createCanvasDom() {
        const inkComponentRoot = document.createElement("div");
        inkComponentRoot.classList.add("ink-component-root");

        const inkSurface = document.createElement("div");
        inkSurface.classList.add("ink-surface");

        this.canvasElement.classList.add("ink-canvas");

        const inkToolbar = this.createToolbar();

        inkComponentRoot.appendChild(inkSurface);
        inkSurface.appendChild(this.canvasElement);
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
        colorButton.setAttribute("title", "Change Color");
        colorButton.addEventListener("click", this.toggleColorPicker.bind(this));

        const replayButton = document.createElement("button");
        replayButton.classList.add("ink-toolbar-button", "fluid-icon-replay");
        replayButton.setAttribute("title", "Replay");
        replayButton.addEventListener("click", this.inkCanvas.replay.bind(this.inkCanvas));

        const clearButton = document.createElement("button");
        clearButton.classList.add("ink-toolbar-button", "fluid-icon-cross");
        clearButton.setAttribute("title", "Clear");
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

interface IToolbarProps {
    toggleColorPicker: () => void;
    replayInk: () => void;
    clearInk: () => void;
}

const Toolbar: React.FC<IToolbarProps> = (props) => {
    const { toggleColorPicker, replayInk, clearInk } = props;
    return (
        <div className="ink-toolbar">
            <button
                className="ink-toolbar-button fluid-icon-pencil"
                title="Change Color"
                onClick={toggleColorPicker}
            ></button>
            <button
                className="ink-toolbar-button fluid-icon-replay"
                title="Replay"
                onClick={replayInk}
            ></button>
            <button
                className="ink-toolbar-button fluid-icon-cross"
                title="Clear"
                onClick={clearInk}
            ></button>
        </div>
    );
};

interface IColorOptionProps {
    color: IColor;
    choose: () => void;
}

const ColorOption: React.FC<IColorOptionProps> = (props) => {
    const { color, choose } = props;
    return (
        <button
            className="ink-color-option"
            onClick={ choose }
            style={{ backgroundColor: `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})` }}
        ></button>
    );
};

interface IColorPickerProps {
    show: boolean;
    choose: (color: IColor) => void;
}

const ColorPicker: React.FC<IColorPickerProps> = (props) => {
    const { show, choose } = props;
    return (
        <div className={`ink-color-picker${show ? " show" : ""}`}>
            {
                colorPickerColors.map((color, index) => {
                    const pickColor = () => {
                        choose(color);
                    }
                    return <ColorOption key={index} color={color} choose={pickColor} />
                })
            }
        </div>
    );
};

interface ICanvasReactViewProps {
    canvas: Canvas;
}

export const CanvasReactView: React.FC<ICanvasReactViewProps> = (props) => {
    const [showColorPicker, setShowColorPicker] = useState<boolean>(false);
    const toggleColorPicker = () => {
        setShowColorPicker(!showColorPicker);
    };
    const replayInk = () => {};
    const clearInk = () => {};
    const chooseColor = (color: IColor) => {
        // TODO
    };
    return (
        <div className="ink-component-root">
            <div className="ink-surface">
                <canvas className="ink-canvas"></canvas>
                <Toolbar
                    toggleColorPicker={ toggleColorPicker }
                    replayInk={ replayInk }
                    clearInk={ clearInk }
                />
            </div>
            <ColorPicker show={ showColorPicker } choose={ chooseColor } />
        </div>
    );
};
