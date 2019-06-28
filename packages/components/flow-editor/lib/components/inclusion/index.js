import { Dom, Template } from "@prague/flow-util";
import { FlowViewComponent } from "..";
import * as styles from "./index.css";
const template = new Template({
    tag: "span",
    props: { className: styles.inclusion },
});
// TODO: This can not yet be made a Symbol due to multiple/recursive WebPack bundles.
//       'unique symbol' should work, but isn't yet universally supported (e.g., breaks tests on Node v8).
const ignoreEventSym = "InclusionView.ignoreEvent";
// Reusable event handler used to mark events has having bubbled out of an inclusion.
const markInclusionEvent = (e) => {
    e[ignoreEventSym] = true;
};
// List of events that the FlowEditor may try to hijack.
const events = [
    "mousedown", "keydown", "keypress",
];
/**
 * Returns true if the given event has bubbled up from an inclusion.  Used by FlowEditor to avoid
 * hijacking events that should bubble to document/window for default action or dispatch by synthetic
 * event handlers (e.g., React).
 */
export function shouldIgnoreEvent(e) {
    return e[ignoreEventSym];
}
export class InclusionView extends FlowViewComponent {
    mounting(props) {
        const root = template.clone();
        for (const type of events) {
            root.addEventListener(type, markInclusionEvent);
        }
        return this.updating(props, { root, cursorTarget: props.child });
    }
    updating(props, state) {
        const root = state.root;
        const desiredChild = props.child;
        if (root.firstChild !== desiredChild) {
            Dom.replaceFirstChild(root, desiredChild);
            state = { root, cursorTarget: desiredChild };
        }
        return state;
    }
    unmounting(state) {
        for (const type of events) {
            state.root.removeEventListener(type, markInclusionEvent);
        }
    }
}
InclusionView.factory = () => new InclusionView();
//# sourceMappingURL=index.js.map