/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Component } from "./component";
import { debug } from "./debug";
import { Rectangle } from "./geometry";
import { removeAllChildren } from "./utils";

// The majority of this can likely be abstracted behind interfaces - drawing inspiration from other
// UI frameworks. For now we keep it simple and have this class manage the lifetime of the UI framework.

/**
 * Hosts a UI container within the browser
 */
export class BrowserContainerHost {
    private _root: Component | undefined;
    private get root(): Component {
        if (this._root === undefined) {
            throw new Error("Root accessed before created");
        }
        return this._root;
    }
    private parent: HTMLElement | undefined;

    public attach(root: Component, parent?: HTMLElement) {
        debug("Attaching new component to browser host");

        // Make note of the root node
        if (this._root) {
            throw new Error("A component has already been attached");
        }
        this._root = root;
        this.parent = parent;

        // Listen for resize messages and propagate them to child elements
        window.addEventListener("resize", () => {
            debug("resize");
            this.resize();
        });

        // Throttle the resizes?

        // Input event handling
        document.body.onkeydown = (e) => {
            this.root.emit("keydown", e);
        };

        document.body.onkeypress = (e) => {
            this.root.emit("keypress", e);
        };

        if (parent) {
            parent.appendChild(root.element);
        } else {
            removeAllChildren(document.body);
            document.body.appendChild(root.element);
        }

        // Trigger initial resize due to attach
        this.resize();
        this.resize(); // Have to resize twice because we get a weird bounding rect the first time, not sure why
    }

    private resize() {
        let clientRect;
        let newSize;
        if (this.parent) {
            clientRect = this.parent.getBoundingClientRect();
            newSize = Rectangle.fromClientRect(clientRect);
            // Assume parent div is containing block and we want to render at its top-leftmost
            newSize.x = 0;
            newSize.y = 0;

            const borderWidth = (parseFloat(this.parent.style.borderLeftWidth) || 0)
                + (parseFloat(this.parent.style.borderRightWidth) || 0);
            const borderHeight = (parseFloat(this.parent.style.borderTopWidth) || 0)
                + (parseFloat(this.parent.style.borderBottomWidth) || 0);
            newSize.width -= borderWidth;
            newSize.height -= borderHeight;
        } else {
            clientRect = document.body.getBoundingClientRect();
            newSize = Rectangle.fromClientRect(clientRect);
        }
        newSize.conformElement(this.root.element);
        this.root.resize(newSize);
    }
}
