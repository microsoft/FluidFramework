/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Template } from "@prague/flow-util";
import { SegmentSpan } from "../../../document";
import { FlowViewComponent, IViewState } from "../../layout";

// tslint:disable:no-empty-interface
export interface IMarkerProps { }
export interface IMarkerViewState extends IViewState {}

export class MarkerView extends FlowViewComponent<IMarkerProps, IMarkerViewState> {
    constructor(private readonly template: Template) { super(); }

    public mounting(): IMarkerViewState {
        return { root: this.template.clone() };
    }

    public updating(props: Readonly<IMarkerProps>, state: Readonly<IMarkerViewState>): IMarkerViewState {
        return state;
    }

    public unmounting() { /* do nothing */ }

    public caretBoundsToSegmentOffset(x: number, top: number, bottom: number): number {
        return 0;
    }

    public nodeAndOffsetToSegmentAndOffset(node: Node, nodeOffset: number, span: SegmentSpan) {
        return { segment: span.firstSegment, offset: 0 };
    }

    public segmentOffsetToNodeAndOffset(offset: number): { node: Node; nodeOffset: number; } {
        return {
            node: this.template.get(this.root, "cursorTarget").firstChild,
            nodeOffset: 0,
        };
    }
}
