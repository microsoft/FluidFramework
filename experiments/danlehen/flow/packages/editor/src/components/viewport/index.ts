import { e } from "../../dom";
import { IViewState, IView } from "..";
import { IScrollBarViewState, ScrollbarView, IScrollBarProps, ScrollbarOrientation } from "../scrollbar";
import * as styles from "./index.css";

const template = e({
    tag: "div",
    props: { className: styles.viewport },
    children: [
        { tag: "div", props: { className: styles.viewportSlot }},
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
    readonly scrollbar: IScrollBarViewState;
}

export class ViewportView implements IView<IViewportProps, IViewportViewState> {
    public static readonly instance = new ViewportView();

    constructor() {}

    private getScrollbarProps(props: Readonly<IViewportProps>): IScrollBarProps {
        return {
            min: 0,
            max: props.yMax,
            value: 0,
            orientation: ScrollbarOrientation.Vertical,
            onScroll: props.onScroll
        };
    }

    mount(props: Readonly<IViewportProps>): IViewportViewState {
        const root = template.cloneNode(true) as Element;
        const scrollbar = ScrollbarView.instance.mount(this.getScrollbarProps(props));
        (scrollbar.root as HTMLElement).style.gridArea = "scrollbar";
        root.appendChild(scrollbar.root);

        return this.update(props, {
            root,
            slot: root.firstElementChild as HTMLElement,
            scrollbar
        });
    }

    update(props: Readonly<IViewportProps>, state: Readonly<IViewportViewState>): IViewportViewState {
        const { root, slot } = state;
        const scrollbar = ScrollbarView.instance.update(this.getScrollbarProps(props), state.scrollbar);
        slot.style.marginTop = `${-props.scrollY}px)`;
        return { root, slot, scrollbar };
    }

    unmount(state: Readonly<IViewportViewState>) { }
}