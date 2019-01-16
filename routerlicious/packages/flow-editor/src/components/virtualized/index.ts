import { IViewState, View } from "..";
import { IEditorProps, Editor } from "../editor";
import { ViewportView, IViewportProps } from "../viewport";
import { Template } from "@prague/flow-util";
import * as styles from "./index.css";
import { Paginator } from "../document/paginator";

export interface IVirtualizedProps extends IEditorProps { 
    virtualize: boolean;
}

interface IVirtualizedViewState extends IViewState {
    props: IVirtualizedProps,
    paginator: Paginator,
    docView: Editor,
    viewport: ViewportView,
    virtualized: boolean,
    offsetY: number
}

export class VirtualizedView extends View<IVirtualizedProps, IVirtualizedViewState> {
    private readonly template = new Template({ tag: "div", props: { className: styles.virtualized }});

    public static readonly factory = () => new VirtualizedView();

    private onScroll = (value: number) => {
        this.state.paginator.startPosition = value | 0;
        this.update(this.state.props);
    };

    public get cursorPosition() { return this.state.docView.cursorPosition; }

    private ensureVirtualizationMode(props: Readonly<IVirtualizedProps>, state: Readonly<IVirtualizedViewState>, isMounting: boolean) {
        if (props.virtualize !== state.virtualized) {
            const docRoot = state.docView.root;
            docRoot.remove();
    
            if (props.virtualize) {
                // Assign our cached paginator to our props, which are passed through to
                // the FlowEditor component.
                Object.assign(props, { paginator: state.paginator });

                state.root.appendChild(
                    state.viewport.mount(
                        this.getViewportProps(state)));
            } else {
                Object.assign(props, { paginator: undefined });

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
        const paginator = new Paginator(props.doc);
        paginator.startPosition = 0;

        const state = {
            props,
            root,
            docView,
            viewport,
            virtualized: !props.virtualize,
            paginator,
            offsetY: 0
        };
        this.ensureVirtualizationMode(props, state, /* isMounting */ true);

        // Note: We set 'virtualized' to the opposite of the requested state to force 'updating()' to
        //       make the necessary DOM changes for mount().
        return this.updating(props, state);
    }

    private getViewportProps(state: Readonly<IVirtualizedViewState>): IViewportProps {
        return {
            slot: state.docView.root,
            onScroll: this.onScroll,
            sizeY: 8192,
            offsetY: state.offsetY
        }
    }

    public updating(props: Readonly<IVirtualizedProps>, state: Readonly<IVirtualizedViewState>): IVirtualizedViewState {
        this.ensureVirtualizationMode(props, state, /* isMounting */ false);

        if (props.virtualize) {
            // Reset viewport scroll to 0 
            Object.assign(state, { offsetY: 0 });
            state.viewport.update(this.getViewportProps(state));
            state.docView.update(state.props);

            const dy = state.paginator.deltaY;
            console.log(`dy: ${dy}`);

            const top = state.viewport.slotOriginTop;
            console.log(`top: ${top}`)

            const sum = -dy + top;
            console.log(`sum: ${sum}`);

            Object.assign(state, { offsetY: sum });
            state.viewport.update(this.getViewportProps(state));
        } else {
            Object.assign(props, { paginator: undefined });
        }

        Object.assign(state.props, props);

        return state;
    }

    public unmounting(state: Readonly<IVirtualizedViewState>) {
        state.docView.unmount();

        if (state.virtualized) {
            state.viewport.unmount();
        }
    }
}