import * as core from "./core";

/**
 * Pen data for the current stroke
 */
export interface IPen {
    // Color in web format #rrggbb
    color: core.IColor;

    // Thickness of pen in pixels
    thickness: number;
}
