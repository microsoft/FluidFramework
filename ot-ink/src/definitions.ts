/**
 * Kind of MixInk action which is used to decide if current action is for draring, moving or clearing canvas
 */
export enum MixInkActionKind {
    Move = 0,
    Draw = 1,
    Clear = 2,
}

/**
 * The action which is used to draw strokes
 */
export interface IMixInkAction {
    // Milliseconds since start of MixInking when this stroke should be drawn
    time: number;

    // Move or darw
    kind: MixInkActionKind;

    // x coordinate
    x: number;

    // y coordinate
    y: number;

    // Pen data if the pen has changed with this stroke
    pen?: IPen;
};

/**
 * Pen data for the current stroke
 */
export interface IPen {
    // Color in web format #rrggbb
    color: string;

    // Thickness of pen in pixels
    thickness: number;

    // Width and height for highlighter brush type
    width?: number;
    height?: number;

    // Brush type, by default b is 0
    brush?: number;
}

export enum MixInkBlush {
    Pen = 0,
    Eraser = 1,
    Highlighter = 2,
}

export enum SegmentCircleInclusive {
    None,
    Both,
    Start,
    End,
}
