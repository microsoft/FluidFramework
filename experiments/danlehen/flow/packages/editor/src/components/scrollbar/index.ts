import { e } from "../../dom";
import * as styles from "./index.css";
import { IViewState, IView } from "..";

const template = e({ 
    tag: "div", 
    children: [{
        tag: "div",
        props: { className: styles.scrollbarContent }
    }]
});

export enum ScrollbarOrientation {
    Horizontal = 0,
    Vertical = 1,
}

const orientationToClass = [
    styles.scrollbarHorizontal,
    styles.scrollbarVertical,
]

export interface IScrollBarProps {
    orientation: ScrollbarOrientation;
    min: number;
    max: number;
    value: number;
    onScroll?: (value: number) => void;
}

export interface IScrollBarViewState extends IViewState {
    readonly root: Element;
    readonly content: HTMLElement;
    onScroll?: (value: number) => void;
    onScrollRaw?: EventListener;
}

export class ScrollbarView implements IView<IScrollBarProps, IScrollBarViewState> {
    public static readonly instance = new ScrollbarView();

    constructor() {}

    private adjust(props: IScrollBarProps, length: number) {
        const delta = props.max - props.min;
        const size = length + delta;
        return `${size}px`; 
    }

    private sync(props: IScrollBarProps, state: IScrollBarViewState) {
        const bounds = state.root.getBoundingClientRect();
        const content = state.content;
        
        switch (props.orientation) {
            case ScrollbarOrientation.Horizontal: {
                content.style.width = this.adjust(props, bounds.width);
                content.style.height = "0px";
                break;
            }
            case ScrollbarOrientation.Vertical: {
                content.style.width = "0px";
                content.style.height = this.adjust(props, bounds.height);
                break;
            }
        }
    }

    public mount(props: Readonly<IScrollBarProps>): IScrollBarViewState {
        const root = template.cloneNode(true) as Element;

        return this.update(props, { 
            root,
            content: root.firstElementChild as HTMLElement,
        });
    }

    private readonly onScrollVert = (state: Readonly<IScrollBarViewState>) => this.fireOnScroll(state, state.root.scrollTop);
    private readonly onScrollHoriz = (state: Readonly<IScrollBarViewState>) => this.fireOnScroll(state, state.root.scrollLeft);

    private readonly fireOnScroll = (state: Readonly<IScrollBarViewState>, value: number) => {
        value = Math.round(value);
        console.log(`scrollbar: ${value}`);
        (state.onScroll as (value: number) => void)(value);
    }

    public update(props: Readonly<IScrollBarProps>, state: Readonly<IScrollBarViewState>): IScrollBarViewState {
        const root = state.root;
        root.className = orientationToClass[props.orientation];

        if (state.onScrollRaw) {
            state.root.removeEventListener("scroll", state.onScrollRaw);
        }

        let onScrollRaw: undefined | (() => void) = undefined;
        if (props.onScroll) {
            onScrollRaw = props.orientation === ScrollbarOrientation.Vertical
                ? () => this.onScrollVert(state)
                : () => this.onScrollHoriz(state);

            state.root.addEventListener("scroll", onScrollRaw);
        }

        Object.assign(state, { onScroll: props.onScroll, onScrollRaw });
        requestAnimationFrame(() => this.sync(props, state));
        
        return state;
    }

    public unmount(state: Readonly<IScrollBarViewState>) { }
}