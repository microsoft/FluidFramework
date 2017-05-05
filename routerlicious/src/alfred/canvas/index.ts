// The main app code
import * as $ from "jquery";
import Canvas from "./canvas";
import * as utils from "./utils";

// throttle resize events and replace with an optimized version
utils.throttle("resize", "throttled-resize");

export function initialize(id: string) {
    $("document").ready(() => {
        Canvas.Create(connection, canvasP);
        // let mainBoard = new BackBoard(canvas, "hitPlane");
    });
}
