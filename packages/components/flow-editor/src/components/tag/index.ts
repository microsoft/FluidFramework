/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowViewComponent, IViewState } from "..";
import * as styles from "./index.css";

// tslint:disable:no-empty-interface
export interface ITagProps { tag: string; classList?: string; style?: string; }
export interface ITagViewState extends IViewState { className?: string; style?: string; }
// tslint:enable:no-empty-interface

const tagNameAttr = "data-tag-name";

export class TagView extends FlowViewComponent<ITagProps, ITagViewState> {
    public static readonly factory = () => new TagView();

    public mounting(props: ITagProps): ITagViewState {
        const root = document.createElement(props.tag);
        root.setAttribute(tagNameAttr, props.tag);
        return { root };
    }

    public get cursorTarget() { return this.root; }

    public updating(props: Readonly<ITagProps>, state: Readonly<ITagViewState>): ITagViewState {
        const root = state.root;

        console.assert(root.tagName === props.tag);
        console.assert(root.getAttribute(tagNameAttr) === props.tag);

        const { classList, style } = props;

        // The tag's 'className' is the 'styles.tag' style followed by any CSS style classes
        // listed in 'props.classList'.
        const className = classList
            ? `${styles.tag} ${props.classList}`
            : styles.tag;

        this.syncCss(root as HTMLElement, className, style);

        return state;
    }

    public unmounting() { /* do nothing */ }
}
