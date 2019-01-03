import { Template } from "@prague/flow-util";
import { IViewState, View } from "..";
import { ScrollbarView, IScrollBarProps, ScrollbarOrientation } from "../scrollbar";
import * as styles from "./index.css";
import { Dom } from "@prague/flow-util";

const template = new Template({
    tag: "div",
    props: { className: styles.viewport },
    children: [
        { tag: "div", ref: "slot", props: { className: styles.viewportSlot }},
    ]
});

export interface IViewportProps { 
    slot: Element,
    yMin: number,
    yMax: number,
    onScroll: (position: number) => number;
}

export interface IViewportViewState extends IViewState {
    props: IViewportProps;
    root: Element;
    slot: HTMLElement;
    scrollbar: ScrollbarView;
    offsetY: number;
}

export class ViewportView extends View<IViewportProps, IViewportViewState> {
    public static readonly factory = () => new ViewportView();

    private readonly onScroll = (value: number) => {
        const offsetY = this.state.props.onScroll(value);
        this.updating(this.state.props, Object.assign(this.state, { offsetY }));
    };

    private getScrollbarProps(props: Readonly<IViewportProps>): IScrollBarProps {
        return {
            min: 0,
            max: props.yMax,
            orientation: ScrollbarOrientation.Vertical,
            onScroll: this.onScroll
        };
    }

    public mounting(props: Readonly<IViewportProps>): IViewportViewState {
        const root = template.clone();
        const slot = template.get(root, "slot") as HTMLElement;
        const scrollbar = new ScrollbarView();

        scrollbar.mount(this.getScrollbarProps(props));
        scrollbar.root.style.gridArea = "scrollbar";
        root.appendChild(scrollbar.root);

        return this.updating(props, {
            props,
            root,
            slot,
            scrollbar,
            offsetY: 0
        });
    }

    public updating(props: Readonly<IViewportProps>, state: Readonly<IViewportViewState>): IViewportViewState {
        Dom.ensureFirstChild(state.slot, props.slot);
        state.scrollbar.update(this.getScrollbarProps(props));
        state.slot.style.marginTop = `${state.offsetY}px`;
        return state;
    }

    public unmounting(state: Readonly<IViewportViewState>) { 
        state.scrollbar.unmount();
    }
}