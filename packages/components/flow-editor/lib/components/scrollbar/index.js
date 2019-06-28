import { Template } from "@prague/flow-util";
import { View } from "..";
import { debug } from "../../debug";
import * as styles from "./index.css";
const template = new Template({
    tag: "div",
    children: [{
            tag: "div",
            ref: "content",
            props: { className: styles.scrollbarContent },
        }],
});
export var ScrollbarOrientation;
(function (ScrollbarOrientation) {
    ScrollbarOrientation[ScrollbarOrientation["Horizontal"] = 0] = "Horizontal";
    ScrollbarOrientation[ScrollbarOrientation["Vertical"] = 1] = "Vertical";
})(ScrollbarOrientation || (ScrollbarOrientation = {}));
const orientationToClass = [
    styles.scrollbarHorizontal,
    styles.scrollbarVertical,
];
export class ScrollbarView extends View {
    constructor() {
        super(...arguments);
        this.onScrollVert = (state) => this.fireOnScroll(state, state.root.scrollTop);
        this.onScrollHoriz = (state) => this.fireOnScroll(state, state.root.scrollLeft);
        this.fireOnScroll = (state, value) => {
            value = Math.round(value);
            debug(`scrollbar: ${value}`);
            state.onScroll(value);
        };
    }
    mounting(props) {
        const root = template.clone();
        const content = template.get(root, "content");
        return this.updating(props, { root, content });
    }
    updating(props, state) {
        const root = state.root;
        root.className = orientationToClass[props.orientation];
        if (state.onScrollRaw) {
            state.root.removeEventListener("scroll", state.onScrollRaw);
        }
        let onScrollRaw;
        if (props.onScroll) {
            onScrollRaw =
                props.orientation === ScrollbarOrientation.Vertical
                    ? () => this.onScrollVert(state)
                    : () => this.onScrollHoriz(state);
            state.root.addEventListener("scroll", onScrollRaw);
        }
        Object.assign(state, { onScroll: props.onScroll, onScrollRaw });
        const bounds = state.root.getBoundingClientRect();
        const content = state.content;
        if (props.orientation === ScrollbarOrientation.Horizontal) {
            content.style.width = this.adjust(props, bounds.width);
            content.style.height = "0px";
        }
        else if (props.orientation === ScrollbarOrientation.Vertical) {
            content.style.width = "0px";
            content.style.height = this.adjust(props, bounds.height);
        }
        return state;
    }
    unmounting(state) {
        if (state.onScrollRaw) {
            state.root.removeEventListener("scroll", state.onScrollRaw);
        }
    }
    adjust(props, length) {
        const delta = props.max - props.min;
        const size = length + delta;
        return `${size}px`;
    }
}
ScrollbarView.factory = () => new ScrollbarView();
//# sourceMappingURL=index.js.map