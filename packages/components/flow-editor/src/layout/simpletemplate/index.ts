/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Template } from "@prague/flow-util";
import { FlowViewComponent, IViewState } from "..";

// tslint:disable:no-empty-interface
export interface ISimpleTemplateProps { }
export interface ISimpleTemplateViewState extends IViewState {}

export class SimpleTemplateView extends FlowViewComponent<ISimpleTemplateProps, ISimpleTemplateViewState> {
    constructor(private readonly template: Template) { super(); }

    public mounting(): ISimpleTemplateViewState {
        return { root: this.template.clone() };
    }

    public updating(props: Readonly<ISimpleTemplateProps>, state: Readonly<ISimpleTemplateViewState>): ISimpleTemplateViewState {
        return state;
    }

    public unmounting() { /* do nothing */ }

    public caretBoundsToSegmentOffset(x: number, top: number, bottom: number): number {
        return 0;
    }

    public segmentOffsetToNodeAndOffset(offset: number): { node: Node; nodeOffset: number; } {
        return {
            node: this.template.get(this.root, "cursorTarget").firstChild,
            nodeOffset: 0,
        };
    }
}
