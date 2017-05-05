// The main app code
import * as $ from "jquery";
import Canvas from "./canvas";
import * as utils from "./utils";

// throttle resize events and replace with an optimized version
utils.throttle("resize", "throttled-resize");

let canvas: Canvas;

export function initialize(id: string) {
    $("document").ready(() => {
        canvas = new Canvas();
        // let mainBoard = new BackBoard(canvas, "hitPlane");
    });
}
