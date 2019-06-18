/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISegment } from "@prague/merge-tree";
import { LayoutContext } from "./layoutcontext";

export abstract class LayoutSink<TLayoutState> {
    public abstract onPush(
        context: LayoutContext,
        position: number,
        segment: ISegment,
        startOffset: number,
        endOffset: number): TLayoutState;

    public abstract tryAppend(
        state: TLayoutState,
        context: LayoutContext,
        position: number,
        segment: ISegment,
        startOffset: number,
        endOffset: number): boolean;

    public abstract onPop(state: TLayoutState, context: LayoutContext);
}
