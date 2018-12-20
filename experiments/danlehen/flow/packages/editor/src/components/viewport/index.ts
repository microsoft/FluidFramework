import { Template } from "@prague/flow-util";
import { IViewState, View } from "..";
import { ScrollbarView, IScrollBarProps, ScrollbarOrientation } from "../scrollbar";
import * as styles from "./index.css";

const template = new Template({
    tag: "div",
    props: { className: styles.viewport },
    children: [
        { tag: "div", ref: "slot", props: { className: styles.viewportSlot }},
    ]
});

export interface IViewportProps { 
    yMin: number,
    yMax: number,
    scrollY: number;
    onScroll: (position: number) => void;
}

export interface IViewportViewState extends IViewState {
    readonly root: Element;
    readonly slot: HTMLElement;
    readonly scrollbar: ScrollbarView;
}

export class ViewportView extends View<IViewportProps, IViewportViewState> {
    public static readonly factory = () => new ViewportView();

    private getScrollbarProps(props: Readonly<IViewportProps>): IScrollBarProps {
        return {
            min: 0,
            max: props.yMax,
            value: 0,
            orientation: ScrollbarOrientation.Vertical,
            onScroll: props.onScroll
        };
    }

    mounting(props: Readonly<IViewportProps>): IViewportViewState {
        const root = template.clone();
        const slot = template.get(root, "slot") as HTMLElement;
        const scrollbar = new ScrollbarView();
        scrollbar.mount(this.getScrollbarProps(props));
        scrollbar.state.root.style.gridArea = "scrollbar";
        root.appendChild(scrollbar.state.root);

        return this.updating(props, {
            root,
            slot,
            scrollbar
        });
    }

    updating(props: Readonly<IViewportProps>, state: Readonly<IViewportViewState>): IViewportViewState {
        const { root, slot, scrollbar } = state;
        scrollbar.update(this.getScrollbarProps(props));
        slot.style.marginTop = `${-props.scrollY}px)`;
        return { root, slot, scrollbar };
    }

    unmounting(state: Readonly<IViewportViewState>) { }
}