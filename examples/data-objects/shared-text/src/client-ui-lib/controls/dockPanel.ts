/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ui from "../ui";

/**
 * Basic dock panel control
 */
export class DockPanel extends ui.Component {
    public bottom: ui.Component | undefined;
    public content: ui.Component | undefined;
    public top: ui.Component | undefined;

    constructor(element: HTMLDivElement) {
        super(element);
    }

    public addContent(content: ui.Component) {
        this.content = content;
        this.updateChildren();
    }

    public addBottom(bottom: ui.Component) {
        this.bottom = bottom;
        this.updateChildren();
    }

    public addTop(top: ui.Component) {
        this.top = top;
        this.updateChildren();
    }

    protected resizeCore(bounds: ui.Rectangle) {
        let bottomOffset = 0;
        if (this.bottom) {
            const result = this.bottom.measure(bounds.size);
            bottomOffset = result.height;
        }
        let topOffset = 0;
        if (this.top) {
            const result = this.top.measure(bounds.size);
            topOffset = result.height;
        }

        const split = bounds.nipVertTopBottom(topOffset, bottomOffset);

        this.updateChildBoundsIfExists(this.top, split[0]);
        this.updateChildBoundsIfExists(this.content, split[1]);
        this.updateChildBoundsIfExists(this.bottom, split[2]);
    }

    /**
     * Updates the list of children and then forces a resize
     */
    private updateChildren() {
        this.removeAllChildren();
        ui.removeAllChildren(this.element);
        this.addChildIfExists(this.content);
        this.addChildIfExists(this.bottom);
        this.addChildIfExists(this.top);
        this.resizeCore(this.size);
    }

    private addChildIfExists(child: ui.Component | undefined) {
        if (child) {
            this.addChild(child);
            this.element.appendChild(child.element);
        }
    }

    private updateChildBoundsIfExists(child: ui.Component | undefined, bounds: ui.Rectangle) {
        if (child) {
            bounds.conformElement(child.element);
            child.resize(bounds);
        }
    }
}
