import * as $ from "jquery";
import { Canvas, throttle } from "../canvas";

// throttle resize events and replace with an optimized version
throttle("resize", "throttled-resize");

let canvas: Canvas;

export function initialize(id: string) {
    $("document").ready(() => {
        canvas = new Canvas();
    });
}

