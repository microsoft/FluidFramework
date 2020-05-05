/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@microsoft/fluid-merge-tree";
import { SequenceEvent } from "@microsoft/fluid-sequence";
import { Caret } from "../editor/caret";
import { emptyObject } from "../util";
import { debug } from "./debug";
import { ILayoutCursor, Layout } from "./layout";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface IFormatterState { }

export abstract class Formatter<TState extends IFormatterState> {
    public abstract begin(
        layout: Layout,
        init: Readonly<Partial<TState>>,
        prevState: Readonly<TState> | undefined,
    ): Readonly<TState>;

    public abstract visit(
        layout: Layout,
        state: Readonly<TState>,
    ): { consumed: boolean, state: Readonly<TState> };

    public abstract end(
        layout: Layout,
        state: Readonly<TState>,
    );

    public onKeyDown(layout: Layout, state: Readonly<TState>, caret: Caret, e: KeyboardEvent) { return false; }
    public onKeyPress(layout: Layout, state: Readonly<TState>, caret: Caret, e: KeyboardEvent) { return false; }

    public onPaste(layout: Layout, state: Readonly<TState>, caret: Caret, e: ClipboardEvent) {
        debug("paste: Unsupported mime: '%o'", [...e.clipboardData.items].map((item) => item.type));
        return false;
    }

    public segmentAndOffsetToNodeAndOffset(
        layout: Layout,
        state: Readonly<TState>,
        segment: ISegment,
        offset: number,
        cursor: Readonly<ILayoutCursor>): { node: Node, nodeOffset: number } | undefined {
        return undefined;
    }

    public nodeAndOffsetToSegmentAndOffset(
        layout: Layout,
        state: Readonly<TState>,
        node: Node,
        nodeOffset: number,
        segment: ISegment,
        cursor: Readonly<ILayoutCursor>): { segment: ISegment, offset: number } | undefined {
        return undefined;
    }
}

export abstract class RootFormatter<TState extends IFormatterState> extends Formatter<TState> {
    public abstract onChange(layout: Layout, e: SequenceEvent);

    public prepare(layout: Layout, start: number, end: number) {
        return { start, end };
    }
}

export class BootstrapFormatter<TFormatter extends RootFormatter<TState>, TState extends IFormatterState> extends RootFormatter<IFormatterState> {
    constructor(private readonly formatter: Readonly<TFormatter>) { super(); }

    public begin(): never { throw new Error(); }

    public visit(layout: Layout, state: Readonly<IFormatterState>) {
        layout.pushFormat(this.formatter, emptyObject);
        return { state, consumed: false };
    }

    public end(): never { throw new Error(); }

    public onChange(layout: Layout, e: SequenceEvent) { this.formatter.onChange(layout, e); }
    public prepare(layout: Layout, start: number, end: number) { return this.formatter.prepare(layout, start, end); }

    public onKeyDown(layout: Layout, state: Readonly<TState>, caret: Caret, e: KeyboardEvent) {
        return this.formatter.onKeyDown(layout, state, caret, e);
    }

    public onKeyPress(layout: Layout, state: Readonly<TState>, caret: Caret, e: KeyboardEvent) {
        return this.formatter.onKeyPress(layout, state, caret, e);
    }

    public onPaste(layout: Layout, state: Readonly<TState>, caret: Caret, e: ClipboardEvent) {
        return this.formatter.onPaste(layout, state, caret, e);
    }

    public segmentAndOffsetToNodeAndOffset(
        layout: Layout,
        state: Readonly<TState>,
        segment: ISegment,
        offset: number,
        cursor: Readonly<ILayoutCursor>): { node: Node, nodeOffset: number } | undefined {
        return this.formatter.segmentAndOffsetToNodeAndOffset(layout, state, segment, offset, cursor);
    }

    public nodeAndOffsetToSegmentAndOffset(
        layout: Layout,
        state: Readonly<TState>,
        node: Node,
        nodeOffset: number,
        segment: ISegment,
        cursor: Readonly<ILayoutCursor>) {
        return this.formatter.nodeAndOffsetToSegmentAndOffset(layout, state, node, nodeOffset, segment, cursor);
    }
}
