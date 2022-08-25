/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { SquaresBoard } from "./squaresBoard";

export interface IPoint2D {
    x: number;
    y: number;
}

export class Square {
    static DEFAULT_LENGTH = 20;
    private canvas: HTMLCanvasElement | undefined;
    position: IPoint2D;
    public board!: SquaresBoard;

    constructor(
        position: IPoint2D,
        private color: string,
        readonly updatePointCb: (pos: IPoint2D) => any,
        public length: number = Square.DEFAULT_LENGTH) {
            this.position = position;
        }

    public draw() {
        if (!this.canvas) {
            throw new Error("The canvas is not set. Square should be added to the board before drawing");
        }
        const ctx = this.canvas.getContext("2d");
        if (!ctx) {
            console.error("The HTML canvas is not found.");
            return;
        }
        const { x, y } = this.position;
        ctx.fillStyle = this.color;
        ctx.fillRect(x, y, this.length, this.length);
    }

    public setCanvas(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }

    public isPointWithin(point: IPoint2D): Square | undefined {
        const { x, y } = this.position;
        const { x: _x, y: _y } = point;
        if ((_x >= x && _x <= x + this.length) && (_y >= y && _y <= y + this.length)) {
            return this;
        }
    }

    public clean() {
        if (!this.canvas) {
            throw new Error("The canvas is not set. Square should be added to the board before cleaning.");
        }
        const ctx = this.canvas.getContext("2d");
        ctx?.clearRect(this.position.x, this.position.y, this.length, this.length);
    }

    public updatePosition(position: { x: number; y: number; }) {
        this.board.clean();
        this.position = position;
        this.board.draw();
    }

    public updateColor(color: string) {
        this.board.clean();
        this.color = color;
        this.board.draw();
    }

    public updateLength(length: number) {
        this.board.clean();
        this.length = length;
        this.board.draw();
    }
}
