/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/flow-document";
import { ServicePlatform } from "@prague/component-runtime";
import { IComponent } from "@prague/container-definitions";
import { Caret, Char, Direction, Template } from "@prague/flow-util";
import { Marker } from "@prague/merge-tree";
import { ComponentDisplayType, IComponent as ILegacyComponent, IComponentRenderHTML } from "@prague/runtime-definitions";
import { FlowViewComponent, IViewState } from "..";
import * as styles from "./index.css";

const template = new Template({
    tag: "span",
    props: { className: styles.inclusion },
    children: [
        { tag: "span", ref: "cursorTarget", props: { textContent: Char.zeroWidthSpace }},
        { tag: "span", ref: "slot", props: { contentEditable: false }},
        { tag: "span", props: { textContent: Char.zeroWidthSpace }},
    ],
});

export interface IInclusionProps {
    doc: FlowDocument;
    marker: Marker;
}

// tslint:disable-next-line:no-empty-interface
export interface IInclusionViewState extends IViewState { }

// This can not yet be made a Symbol due to multiple/recursive WebPack bundles.
// 'unique symbol' should work, but isn't yet universally supported (e.g., breaks tests on Node v8).
const ignoreEventSym = "InclusionView.ignoreEvent";

// Reusable event handler used to mark events has having bubbled out of an inclusion.
const markInclusionEvent = (e: Event) => {
    (e as any)[ignoreEventSym] = true;
};

// List of events that the FlowEditor may try to capture.
const events: string[] = [
    "mousedown", "keydown", "keypress",
];

/**
 * Returns true if the given event has bubbled up from an inclusion. Used by FlowEditor to avoid
 * capturing events that should bubble to document/window for default action or dispatch by synthetic
 * event handlers (e.g., React).
 */
export function shouldIgnoreEvent(e: Event): true | undefined {
    return (e as any)[ignoreEventSym];
}

export class InclusionView extends FlowViewComponent<IInclusionProps, IInclusionViewState> {
    public static readonly factory = () => new InclusionView();

    public get isFocused() {
        return this.inclusionRoot.contains(document.activeElement);
    }

    public caretBoundsToSegmentOffset(x: number, top: number, bottom: number): number { return 0; }
    public segmentOffsetToNodeAndOffset() { return { node: this.inclusionRoot, nodeOffset: 0 }; }

    public mounting(props: Readonly<IInclusionProps>): IInclusionViewState {
        const root = template.clone();

        for (const type of events) {
            root.addEventListener(type, markInclusionEvent);
        }

        const slot = template.get(root, "slot");

        props.doc.getComponent(props.marker).then((component: IComponent | ILegacyComponent) => {
            // TODO included for back compat - can remove once we migrate to 0.5
            if ("attach" in component) {
                const legacyComponent = component as ILegacyComponent;
                legacyComponent.attach(new ServicePlatform([["div", Promise.resolve(slot)]]));
            } else {
                const viewable = (component as IComponent).query<IComponentRenderHTML>("IComponentRenderHTML");
                if (viewable) {
                    viewable.render(slot as HTMLElement, ComponentDisplayType.Inline);
                }
            }
        });

        return this.updating(props, { root });
    }

    public updating(props: Readonly<IInclusionProps>, state: Readonly<IInclusionViewState>): IInclusionViewState {
        return state;
    }

    public unmounting(state: Readonly<IInclusionViewState>) {
        for (const type of events) {
            state.root.removeEventListener(type, markInclusionEvent);
        }
    }

    public caretEnter(direction: Direction, caretBounds: ClientRect) {
        return Caret.caretEnter(this.inclusionRoot, direction, caretBounds);
    }

    private get inclusionRoot() {
        return template.get(this.state.root, "slot").firstElementChild;
    }
}
