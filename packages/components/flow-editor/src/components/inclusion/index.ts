import { Dom, Template } from "@prague/flow-util";
import { FlowViewComponent, IViewState } from "..";
import * as styles from "./index.css";

const template = new Template({
    tag: "span",
    props: { className: styles.inclusion },
});

export interface IInclusionProps { child: Node; }

// tslint:disable-next-line:no-empty-interface
export interface IInclusionViewState extends IViewState {
    child: Node;
}

// TODO: This can not yet be made a Symbol due to multiple/recursive WebPack bundles.
//       'unique symbol' should work, but isn't yet universally supported (e.g., breaks tests on Node v8).
const ignoreEventSym = "InclusionView.ignoreEvent";

// Reusable event handler used to mark events has having bubbled out of an inclusion.
const markInclusionEvent = (e: Event) => {
    (e as any)[ignoreEventSym] = true;
};

// List of events that the FlowEditor may try to hijack.
const events: string[] = [
    "mousedown", "keydown", "keypress",
];

/**
 * Returns true if the given event has bubbled up from an inclusion.  Used by FlowEditor to avoid
 * hijacking events that should bubble to document/window for default action or dispatch by synthetic
 * event handlers (e.g., React).
 */
export function shouldIgnoreEvent(e: Event): true | undefined {
    return (e as any)[ignoreEventSym];
}

export class InclusionView extends FlowViewComponent<IInclusionProps, IInclusionViewState> {
    public static readonly factory = () => new InclusionView();

    public mounting(props: Readonly<IInclusionProps>): IInclusionViewState {
        const root = template.clone();

        for (const type of events) {
            root.addEventListener(type, markInclusionEvent);
        }

        return this.updating(props, { root, child: props.child });
    }

    public get cursorTarget() { return this.state.child; }

    public updating(props: Readonly<IInclusionProps>, state: Readonly<IInclusionViewState>): IInclusionViewState {
        const root = state.root;
        const desiredChild = props.child;

        if (root.firstChild !== desiredChild) {
            Dom.replaceFirstChild(root, desiredChild);
            state = { root, child: desiredChild };
        }

        return state;
    }

    public unmounting(state: Readonly<IInclusionViewState>) {
        for (const type of events) {
            state.root.removeEventListener(type, markInclusionEvent);
        }
    }
}
