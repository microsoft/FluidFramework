import { Caret, Char, Direction, Dom, Template } from "@prague/flow-util";
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

export interface IInclusionProps { child: Element; }

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

    public mounting(props: Readonly<IInclusionProps>): IInclusionViewState {
        const root = template.clone();

        for (const type of events) {
            root.addEventListener(type, markInclusionEvent);
        }

        return this.updating(props, { root });
    }

    public get cursorTarget() { return template.get(this.state.root, "cursorTarget"); }

    public updating(props: Readonly<IInclusionProps>, state: Readonly<IInclusionViewState>): IInclusionViewState {
        const { child } = props;
        Dom.ensureFirstChild(template.get(state.root, "slot"), child);
        return state;
    }

    public unmounting(state: Readonly<IInclusionViewState>) {
        for (const type of events) {
            state.root.removeEventListener(type, markInclusionEvent);
        }
    }

    public get isFocused() {
        return this.inclusionRoot.contains(document.activeElement);
    }

    public caretEnter(direction: Direction, caretBounds: ClientRect) {
        return Caret.caretEnter(this.inclusionRoot, direction, caretBounds);
    }

    private get inclusionRoot() {
        // DANGER: The extra '.firstElementChild' is to compensate for needing an extra element to
        //         pass into the component's attach() method as the 'div' service.  Will need to update
        //         if/when we change 'syncInclusion()'.
        return template.get(this.state.root, "slot").firstElementChild.firstElementChild;
    }
}
