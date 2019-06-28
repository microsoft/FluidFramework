import { Template } from "@prague/flow-util";
import { View } from "..";
import { debug } from "../../debug";
import { Paginator } from "../document/paginator";
import { Editor } from "../editor";
import { ViewportView } from "../viewport";
import * as styles from "./index.css";
export class VirtualizedView extends View {
    constructor() {
        super(...arguments);
        this.template = new Template({ tag: "div", props: { tabIndex: 0, className: styles.virtualized } });
        this.onScroll = (value) => {
            this.state.paginator.startPosition = Math.floor(value);
            this.update(this.state.props);
        };
    }
    get cursorPosition() { return this.state.docView.cursorPosition; }
    mounting(props) {
        const root = this.template.clone();
        Object.assign(props, { eventSink: root });
        const docView = new Editor();
        docView.mount(props);
        const viewport = new ViewportView();
        const paginator = new Paginator(props.doc);
        paginator.startPosition = 0;
        const state = {
            props,
            root,
            docView,
            viewport,
            virtualized: !props.virtualize,
            paginator,
            offsetY: 0,
        };
        this.ensureVirtualizationMode(props, state, /* isMounting */ true);
        // Note: We set 'virtualized' to the opposite of the requested state to force 'updating()' to
        //       make the necessary DOM changes for mount().
        return this.updating(props, state);
    }
    updating(props, state) {
        this.ensureVirtualizationMode(props, state, /* isMounting */ false);
        if (props.virtualize) {
            // Reset viewport scroll to 0
            Object.assign(state, { offsetY: 0 });
            state.viewport.update(this.getViewportProps(state));
            state.docView.update(state.props);
            const dy = state.paginator.deltaY;
            debug(`dy: ${dy}`);
            const top = state.viewport.slotOriginTop;
            debug(`top: ${top}`);
            const sum = -dy + top;
            debug(`sum: ${sum}`);
            Object.assign(state, { offsetY: sum });
            state.viewport.update(this.getViewportProps(state));
        }
        else {
            Object.assign(props, { paginator: undefined });
        }
        Object.assign(state.props, props);
        return state;
    }
    unmounting(state) {
        state.docView.unmount();
        if (state.virtualized) {
            state.viewport.unmount();
        }
    }
    ensureVirtualizationMode(props, state, isMounting) {
        if (props.virtualize !== state.virtualized) {
            const docRoot = state.docView.root;
            docRoot.remove();
            if (props.virtualize) {
                // Assign our cached paginator to our props, which are passed through to
                // the FlowEditor component.
                Object.assign(props, { paginator: state.paginator });
                state.root.appendChild(state.viewport.mount(this.getViewportProps(state)));
            }
            else {
                Object.assign(props, { paginator: undefined });
                if (!isMounting) {
                    state.viewport.unmount();
                }
                state.root.appendChild(docRoot);
            }
            Object.assign(state, { virtualized: props.virtualize });
        }
    }
    getViewportProps(state) {
        return {
            slot: state.docView.root,
            onScroll: this.onScroll,
            sizeY: 8192,
            offsetY: state.offsetY,
        };
    }
}
VirtualizedView.factory = () => new VirtualizedView();
//# sourceMappingURL=index.js.map