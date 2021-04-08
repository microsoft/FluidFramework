import { Square } from "./square";

export class SquaresBoard {
    static HEIGHT = 400;
    static WIDTH = 500;

    selectedSquare: Square | undefined;
    canvas: HTMLCanvasElement;
    wrapper: HTMLDivElement;
    constructor(readonly squares: Square[], readonly elm: HTMLElement) {
        this.canvas = document.createElement('canvas');
        this.wrapper = document.createElement('div');
        this.wrapper.style.display = 'flex';
        this.wrapper.style.alignItems = 'center';
        this.canvas.style.borderStyle = 'solid';
        this.canvas.height = SquaresBoard.HEIGHT;
        this.canvas.width = SquaresBoard.WIDTH;

        this.wrapper.appendChild(this.canvas);
        elm.appendChild(this.wrapper);
        this.canvas.addEventListener('mousedown', this.onMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.onMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.onMouseUp.bind(this));
    }

    draw() {
        for (let i = 0; i < this.squares.length; i++) {
            this.squares[i].draw();
        }
    }

    delete() {
        this.elm.removeChild(this.wrapper);
    }

    addSquare(square: Square) {
        square.setCanvas(this.canvas);
        square.board = this;
        this.squares.push(square);
        square.draw();
    }

    clean() {
        const ctx = this.canvas.getContext('2d');
        ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    private onMouseDown(e: MouseEvent) {
        this.selectedSquare = this.findSquare(e);
    }

    private findSquare(e: MouseEvent): Square | undefined {
        return this.squares.find(square => square.isPointWithin({ x: e.offsetX, y: e.offsetY }));
    }

    private onMouseMove(e: MouseEvent) {
        const square = this.findSquare(e);
        if (square) {
            this.canvas.style.cursor = 'pointer';
        } else {
            this.canvas.style.cursor = 'inherit';
        }

        if (!this.selectedSquare) {
            return;
        }
        this.selectedSquare.updatePointCb({
            x: e.offsetX - this.selectedSquare.length / 2.0,
            y: e.offsetY - this.selectedSquare.length / 2.0
        });
    }

    private onMouseUp(e: MouseEvent) {
        this.selectedSquare = undefined;
    }
}
