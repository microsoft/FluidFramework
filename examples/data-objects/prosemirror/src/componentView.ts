/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Node } from "prosemirror-model";
import { EditorView, NodeView } from "prosemirror-view";
import { ILoader } from "@fluidframework/container-definitions";
import { FluidObject } from "@fluidframework/core-interfaces";
import { HTMLViewAdapter } from "@fluidframework/view-adapters";

export class ComponentView implements NodeView {
    public dom: HTMLElement;
    public innerView;

    private visual: HTMLViewAdapter | undefined;

    constructor(
        public node: Node,
        public outerView: EditorView,
        public getPos: (() => number) | boolean,
        public loader: ILoader,
    ) {
        // The node's representation in the editor (empty, for now)
        this.dom = document.createElement("fluid");
        const src = node.attrs.src;
        this.load(src);
    }

    selectNode() {
        this.dom.classList.add("ProseMirror-selectednode");
    }

    deselectNode() {
        this.dom.classList.remove("ProseMirror-selectednode");
    }

    dispatchInner(tr) {
    }

    update(node) {
        return true;
    }

    destroy() {
    }

    private load(url: string) {
        this.attach(url);
        const containerP = this.loader.resolve({ url });
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        containerP.then((container) => {
            container.on("contextChanged", (value) => {
                this.attach(url);
            });
        });
    }

    private attach(url: string) {
        const loadP = this.loader.request({ url });
        const componentP = loadP.then(
            (result) => {
                if (result.mimeType !== "fluid/object") {
                    throw new Error("Can't insert a non-fluid component");
                }

                const component: FluidObject = result.value;
                if (!HTMLViewAdapter.canAdapt(component)) {
                    throw new Error("Don't know how to render this component");
                }

                return component;
            });

        componentP.then(
            (component) => {
                // Remove the previous view
                if (this.visual) {
                    this.visual.remove();
                }

                // Clear any previous content
                this.dom.innerHTML = "";

                this.visual = new HTMLViewAdapter(component);
                this.visual.render(this.dom);
            },
            (error) => {
                // Fall back to URL if can't load
                this.dom.innerHTML = `<a href="${url}">${url}</a>`;
            });
    }
}
