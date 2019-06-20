/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowViewComponent, IViewState } from "..";
import * as styles from "./index.css";

// tslint:disable:no-empty-interface
export interface ITagProps { tag: string; classList?: string; style?: string; }
export interface ITagViewState extends IViewState { }
// tslint:enable:no-empty-interface

const tagNameAttr = "data-tag-name";

export class TagView extends FlowViewComponent<ITagProps, ITagViewState> {
    public static readonly factory = () => new TagView();

    public mounting(props: ITagProps): ITagViewState {
        const root = document.createElement(props.tag);
        root.setAttribute(tagNameAttr, props.tag);

        return { root };
    }

    public get slot() { return this.state.root; }

    public updating(props: Readonly<ITagProps>, state: Readonly<ITagViewState>): ITagViewState {
        const root = state.root;

        console.assert(root.tagName === props.tag);
        console.assert(root.getAttribute(tagNameAttr) === props.tag);

        this.syncCss(root as HTMLElement, props, styles.tag);

        return state;
    }

    public unmounting() { /* do nothing */ }

    public caretBoundsToSegmentOffset(x: number, top: number, bottom: number): number {
        return 0;
    }

    public segmentOffsetToNodeAndOffset(offset: number): { node: Node; nodeOffset: number; } {
        return { node: this.slot, nodeOffset: offset };
    }
}
