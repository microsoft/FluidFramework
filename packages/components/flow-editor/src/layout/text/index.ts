/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dom, Template } from "@prague/flow-util";
import { FlowViewComponent, IViewState } from "..";
import * as style from "./index.css";

export { TextLayout } from "./layout";

const template = new Template({ tag: "p", props: { className: style.text }});

export interface ITextProps {
    text: string;
    style?: string;
    classList?: string;
}

// tslint:disable-next-line:no-empty-interface
export interface ITextViewState extends IViewState { }

export class TextView extends FlowViewComponent<ITextProps, ITextViewState> {
    // Note: As long as textContent is not empty, the <span> must have a firstChild.
    public get cursorTarget() { return this.state.root.firstChild; }
    public static readonly factory = () => new TextView();

    public mounting(props: Readonly<ITextProps>): ITextViewState {
        return this.updating(props, { root: template.clone() });
    }

    public updating(props: Readonly<ITextProps>, state: Readonly<ITextViewState>): ITextViewState {
        const { text } = props;
        console.assert(text, "Should not emit a TextView for empty text.");

        // Ensure the text content of the <p> tag is up to date (note that 'text' must be non-empty,
        // therefore a simple strict equality check will suffice.)
        const root = state.root;
        if (root.textContent !== text) {
            root.textContent = text;
        }

        // Ensure the <p> tag's 'className' and 'style' properties are up to date.
        this.syncCss(root as HTMLElement, props, style.text);

        return state;
    }

    public unmounting(state: Readonly<ITextViewState>) { /* do nothing */ }

    public caretBoundsToSegmentOffset(x: number, top: number, bottom: number) {
        return Dom.findNodeOffset(this.cursorTarget, x, top, bottom);
    }

    public segmentOffsetToNodeAndOffset(offset: number) {
        const node = this.state.root.firstChild;
        return { node, nodeOffset: Math.max(Math.min(offset, node.textContent.length), 0) };
    }
}
