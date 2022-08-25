/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { StepMap } from "prosemirror-transform";
import { keymap } from "prosemirror-keymap";
import { undo, redo } from "prosemirror-history";
import { EditorView } from "prosemirror-view";
import { EditorState } from "prosemirror-state";
import { ILoader } from "@fluidframework/container-definitions";
import { ComponentView } from "./componentView";

export class FootnoteView {
    public node;
    public outerView;
    public getPos;
    public dom;
    public innerView;

    constructor(node, view, getPos, private readonly loader: ILoader) {
        // We'll need these later
        this.node = node;
        this.outerView = view;
        this.getPos = getPos;

        // The node's representation in the editor (empty, for now)
        this.dom = document.createElement("footnote");
        // These are used when the footnote is selected
        this.innerView = null;
    }

    selectNode() {
        this.dom.classList.add("ProseMirror-selectednode");
        if (!this.innerView) { this.open(); }
    }

    deselectNode() {
        this.dom.classList.remove("ProseMirror-selectednode");
        if (this.innerView) { this.close(); }
    }

    open() {
        // Append a tooltip to the outer node
        const tooltip = this.dom.appendChild(document.createElement("div"));
        tooltip.className = "footnote-tooltip";
        // And put a sub-ProseMirror into that
        this.innerView = new EditorView(tooltip, {
            // You can use any node as an editor document
            state: EditorState.create({
                doc: this.node,
                plugins: [keymap({
                    "Mod-z": () => undo(this.outerView.state, this.outerView.dispatch),
                    "Mod-y": () => redo(this.outerView.state, this.outerView.dispatch),
                })],
            }),
            nodeViews: {
                fluid: (node, view, getPos) => new ComponentView(node, view, getPos, this.loader),
            },
            // This is the magic part
            dispatchTransaction: this.dispatchInner.bind(this),
            handleDOMEvents: {
                mousedown: () => {
                    // Kludge to prevent issues due to the fact that the whole
                    // footnote is node-selected (and thus DOM-selected) when
                    // the parent editor is focused.
                    if (this.outerView.hasFocus()) { this.innerView.focus(); }
                    return true;
                },
            },
        });
    }

    close() {
        this.innerView.destroy();
        this.innerView = null;
        this.dom.textContent = "";
    }

    dispatchInner(tr) {
        const { state, transactions } = this.innerView.state.applyTransaction(tr);
        this.innerView.updateState(state);

        if (!tr.getMeta("fromOutside")) {
            const outerTr = this.outerView.state.tr; const offsetMap = StepMap.offset(this.getPos() + 1);

            for (const transaction of transactions) {
                for (const step of transaction.steps) {
                    outerTr.step(step.map(offsetMap));
                }
            }

            if (outerTr.docChanged) {
                this.outerView.dispatch(outerTr);
            }
        }
    }

    update(node) {
        if (!node.sameMarkup(this.node)) { return false; }
        this.node = node;
        if (this.innerView) {
            const state = this.innerView.state;
            const start = node.content.findDiffStart(state.doc.content);
            if (start != null) {
                let { a: endA, b: endB } = node.content.findDiffEnd(state.doc.content);
                const overlap = start - Math.min(endA, endB);
                if (overlap > 0) { endA += overlap; endB += overlap; }
                this.innerView.dispatch(
                    state.tr
                        .replace(start, endB, node.slice(start, endA))
                        .setMeta("fromOutside", true));
            }
        }
        return true;
    }

    destroy() {
        if (this.innerView) { this.close(); }
    }

    stopEvent(event) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.innerView?.dom.contains(event.target);
    }

    ignoreMutation() { return true; }
}
