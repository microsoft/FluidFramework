/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isBrowser } from "../isbrowser";
import { Template } from "../template";
import { View } from "../view";
import * as style from "./index.css";

const template = isBrowser && new Template(
    {
        tag: "div", ref: "root", props: { className: style.root }, children: [
            {
                tag: "div", ref: "observer", props: { className: style.observer }, children: [
                    {
                        tag: "div", ref: "expand", props: { className: style.expand }, children: [
                            { tag: "div", ref: "expandChild", props: { className: style.expandChild } },
                        ],
                    },
                    {
                        tag: "div", ref: "shrink", props: { className: style.shrink }, children: [
                            { tag: "div", props: { className: style.shrinkChild } },
                        ],
                    },
                ],
            },
            { tag: "span", ref: "slot" },
        ],
    },
);

interface IResizeObserverInit {
    subject: Element;
    callback: () => void;
}

/**
 * Experimental container that uses CSS scroll events to detect when a child DOM element resizes,
 * as a possible path toward polyfilling the Chrome native resize observer:
 * https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
 *
 * Based on 'ResizeSensor' from Marc J. Schmidt's 'CSS Element Queries':
 * https://github.com/marcj/css-element-queries/blob/09d4cf12a2bf2c143274bbe4e4bc04060e55880f/src/ResizeSensor.js
 */
export class ResizeObserver extends View<IResizeObserverInit> {
    private state?: {
        callback: () => void;
        root: HTMLElement;
        expand: HTMLElement;
        expandChild: HTMLElement;
        shrink: Element;
        slot: Element;
        width: number;
        height: number;
    };

    protected onAttach(init: Readonly<IResizeObserverInit>) {
        const root = template.clone() as HTMLElement;
        const expand = template.get(root, "expand") as HTMLElement;
        const expandChild = template.get(root, "expandChild") as HTMLElement;
        const shrink = template.get(root, "shrink");
        const slot = template.get(root, "slot");

        expand.addEventListener("scroll", this.onExpandScrolled);
        shrink.addEventListener("scroll", this.onShrinkScrolled);

        const { subject, callback } = init;
        slot.appendChild(subject);

        this.state = { callback, root, expand, expandChild, shrink, slot, width: NaN, height: NaN };

        return root;
    }

    protected onUpdate(): void {
        this.reset();
    }

    protected onDetach(): void {
        const state = this.state;
        state.expand.removeEventListener("scroll", this.onExpandScrolled);
        state.shrink.removeEventListener("scroll", this.onShrinkScrolled);
        this.state = undefined;
    }

    private readonly onExpandScrolled = () => {
        const { root, width, height } = this.state;
        if (root.offsetWidth > width || root.offsetHeight > height) {
            this.state.callback();
        }
        this.reset();
    };

    private readonly onShrinkScrolled = () => {
        const { root, width, height } = this.state;
        if (root.offsetWidth < width || root.offsetHeight < height) {
            this.state.callback();
        }
        this.reset();
    };

    private reset() {
        const { expandChild, expand, shrink, root } = this.state;
        expandChild.style.width = `${expand.offsetWidth + 1}px`;
        expandChild.style.height = `${expand.offsetHeight + 1}px`;
        expand.scrollLeft = expand.scrollWidth;
        expand.scrollTop = expand.scrollHeight;
        shrink.scrollLeft = shrink.scrollWidth;
        shrink.scrollTop = shrink.scrollHeight;
        this.state.width = root.offsetWidth;
        this.state.height = root.offsetHeight;
    }
}
