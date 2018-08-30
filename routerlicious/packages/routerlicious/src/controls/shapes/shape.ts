import * as ui from "../../ui";

export interface IShape {
    render(context2D: CanvasRenderingContext2D, offset: ui.IPoint);

    getBounds(): ui.Rectangle;
}
