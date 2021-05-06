/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ui from "../ui";
import { ScrollBar } from "./scrollBar";

const scrollAreaWidth = 18;

/**
 * A layer panel stacks children in a z order defined by their child index. It is used to overlay layers
 * on top of each other.
 *
 * TODO: This is becoming more of a custom flow view specific control rather than an abstract control
 */
export class LayerPanel extends ui.Component {
    public scrollBar: ScrollBar;
    private scrollBarVisible: boolean = false;

    constructor(element: HTMLDivElement) {
        super(element);

        // Scrollbar
        const scrollBarElement = document.createElement("div");
        this.scrollBar = new ScrollBar(scrollBarElement);
        this.addChild(this.scrollBar);
        this.element.appendChild(this.scrollBar.element);
    }

    /**
     * Adds a new child to the stack
     */
    public addChild(component: ui.Component) {
        super.addChild(component, this.getChildren().length - 1);
        this.element.insertBefore(component.element, this.element.lastChild);
    }

    public showScrollBar(show: boolean) {
        if (this.scrollBarVisible !== show) {
            this.scrollBarVisible = show;
            this.resizeCore(this.size);
        }
    }

    protected resizeCore(bounds: ui.Rectangle) {
        let _bounds = bounds;
        // TODO this is a temporary fix - need to change resize to just have a size and not a rectangle. Parent
        // will position the element. Child only needs to lay itself out within a size. System will then do any
        // geometry transforms to correctly place in screen space.
        _bounds = new ui.Rectangle(0, 0, _bounds.width, _bounds.height);

        let scrollBounds: ui.Rectangle;
        let contentBounds: ui.Rectangle;

        if (this.scrollBarVisible) {
            const nippedBounds = _bounds.nipHorizRight(scrollAreaWidth);
            scrollBounds = nippedBounds[1];
            contentBounds = nippedBounds[0];

            this.scrollBar.element.style.display = "block";
            scrollBounds.conformElement(this.scrollBar.element);
            this.scrollBar.resize(scrollBounds);
        } else {
            contentBounds = _bounds;
            this.scrollBar.element.style.display = "none";
        }

        const children = this.getChildren();
        for (let i = 0; i < children.length - 1; i++) {
            const child = children[i];
            contentBounds.conformElement(child.element);
            child.resize(contentBounds);
        }
    }
}
