// The main app code
import { Promise } from "es6-promise";
import * as $ from "jquery";
import * as collabClient from "../collab/client";
import BackBoard from "./backBoard";
import Canvas from "./canvas";
import InkCanvas from "./inkCanvas";
import { Canvas as CanvasModel } from "./models/canvas";
import StickyNote from "./stickyNote";
import * as utils from "./utils";

// throttle resize events and replace with an optimized version
utils.throttle("resize", "throttled-resize");

let connection = collabClient.connect();

export function initialize(id: string) {
    let canvasP = CanvasModel.LoadOrCreate(connection, id);

    $("document").ready(() => {
        Canvas.Create(canvasP);
        // let mainBoard = new BackBoard(canvas, "hitPlane");
    });
}
