import { Dom, Template } from "@prague/flow-util";
import { View } from "..";
import { debug } from "../../debug";
import * as styles from "./index.css";
const template = new Template({
    tag: "div",
    props: { className: styles.viewport },
    children: [
        { tag: "div", props: { className: styles.ref }, children: [
                { tag: "div", ref: "transform", props: { className: styles.transform }, children: [
                        { tag: "div", props: { className: styles.document }, children: [
                                { tag: "div", ref: "slot", props: { className: styles.slot } },
                            ] },
                    ] },
                { tag: "div", props: { className: `${styles.slot} ${styles.position}` }, children: [
                        { tag: "div", props: { className: `${styles.document} ${styles.position}` }, children: [
                                { tag: "div", ref: "origin", props: { className: styles.origin } },
                            ] },
                    ] },
            ] },
        {
            tag: "div",
            ref: "scrollPane",
            props: { className: styles.scrollPane },
            children: [
                { tag: "div", ref: "space", props: { className: styles.space } },
            ],
        },
    ],
});
export class ViewportView extends View {
    constructor() {
        super(...arguments);
        this.onScroll = () => {
            const state = this.state;
            state.props.onScroll(state.scrollPane.scrollTop);
        };
    }
    get slotOriginTop() {
        return this.state.origin.getBoundingClientRect().top;
    }
    mounting(props) {
        const root = template.clone();
        const slot = template.get(root, "slot");
        const transform = template.get(root, "transform");
        const origin = template.get(root, "origin");
        const scrollPane = template.get(root, "scrollPane");
        const space = template.get(root, "space");
        scrollPane.addEventListener("scroll", this.onScroll);
        // TypeScript 3.2.2 'lib.dom.d.ts' does not type "wheel" event as WheelEvent.
        const onWheel = ((e) => {
            const delta = e.deltaY;
            scrollPane.scrollTop += delta;
        });
        root.addEventListener("wheel", onWheel);
        return this.updating(props, {
            props,
            root,
            slot,
            transform,
            origin,
            scrollPane,
            space,
            offsetY: 0,
            sizeY: props.sizeY,
        });
    }
    updating(props, state) {
        Dom.ensureFirstChild(state.slot, props.slot);
        state.space.style.height = `${props.sizeY}px`;
        debug(`  offset: ${props.offsetY}`);
        state.transform.style.top = `${props.offsetY}px`;
        return state;
    }
    unmounting(state) {
        state.root.removeEventListener("scroll", this.onScroll);
    }
}
ViewportView.factory = () => new ViewportView();
//# sourceMappingURL=index.js.map