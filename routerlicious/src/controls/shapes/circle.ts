import { IPoint } from "../../ui";
import { IShape } from "./shape";

export interface ICircle extends IShape {
    center: IPoint;
    radius: number;
}

export class Circle implements ICircle {
    constructor(public center: IPoint, public radius: number) {
    }

    public render(context2D: CanvasRenderingContext2D) {
        context2D.moveTo(this.center.x, this.center.y);
        context2D.arc(this.center.x, this.center.y, this.radius, 0, Math.PI * 2);
    }
}
