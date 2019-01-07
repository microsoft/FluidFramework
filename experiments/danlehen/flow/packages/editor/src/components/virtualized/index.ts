import { IViewState, View } from "..";
import { IEditorProps, Editor } from "../editor";
import { ViewportView, IViewportProps } from "../viewport";
import { Template } from "@prague/flow-util";
import * as styles from "./index.css";

export interface IVirtualizedProps extends IEditorProps { 
    virtualize: boolean;
}

interface IVirtualizedViewState extends IViewState {
    virtualized: boolean,
    docView: Editor,
    viewport: ViewportView
}

export class VirtualizedView extends View<IVirtualizedProps, IVirtualizedViewState> {
    private readonly template = new Template({ tag: "div", props: { className: styles.virtualized }});

    public static readonly factory = () => new VirtualizedView();

    private onScroll = (value: number) => {
        const result = -value;
        console.log(`onScroll: ${value} -> ${result}px`);
        return result; 
    };

    public get cursorPosition() { return this.state.docView.cursorPosition; }

    private ensureVirtualizationMode(props: Readonly<IVirtualizedProps>, state: Readonly<IVirtualizedViewState>, isMounting: boolean) {
        if (props.virtualize !== state.virtualized) {
            const docRoot = state.docView.root;
            docRoot.remove();
    
            if (props.virtualize) {
                state.root.appendChild(
                    state.viewport.mount(
                        this.getViewportProps(props, state)));
            } else {
                if (!isMounting) {
                    state.viewport.unmount();
                }
                state.root.appendChild(docRoot);
            }

            Object.assign(state, { virtualized: props.virtualize });
        }
    }

    public mounting(props: Readonly<IVirtualizedProps>): IVirtualizedViewState {
        const root = this.template.clone();
        const docView = new Editor();
        docView.mount(props);

        const viewport = new ViewportView();
        const state = { root, docView, viewport, virtualized: !props.virtualize };
        this.ensureVirtualizationMode(props, state, /* isMounting */ true);

        // Note: We set 'virtualized' to the opposite of the requested state to force 'updating()' to
        //       make the necessary DOM changes for mount().
        return this.updating(props, state);
    }

    private getViewportProps(props: Readonly<IVirtualizedProps>, state: Readonly<IVirtualizedViewState>): IViewportProps {
        return {
            slot: state.docView.root,
            onScroll: this.onScroll,
            sizeY: 8192
        }
    }

    public updating(props: Readonly<IVirtualizedProps>, state: Readonly<IVirtualizedViewState>): IVirtualizedViewState {
        this.ensureVirtualizationMode(props, state, /* isMounting */ false);

        if (props.virtualize) {
            state.viewport.update(this.getViewportProps(props, state));
        }

        return state;
    }

    public unmounting(state: Readonly<IVirtualizedViewState>) {
        state.docView.unmount();

        if (state.virtualized) {
            state.viewport.unmount();
        }
    }
}