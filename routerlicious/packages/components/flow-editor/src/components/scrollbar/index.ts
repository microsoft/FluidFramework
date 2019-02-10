import { Template } from "@prague/flow-util";
import { IViewState, View } from "..";
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

export enum ScrollbarOrientation {
    Horizontal = 0,
    Vertical = 1,
}

const orientationToClass = [
    styles.scrollbarHorizontal,
    styles.scrollbarVertical,
];

export interface IScrollBarProps {
    orientation: ScrollbarOrientation;
    min: number;
    max: number;
    onScroll?: (value: number) => void;
}

export interface IScrollBarViewState extends IViewState {
    readonly root: HTMLElement;
    readonly content: HTMLElement;
    onScroll?: (value: number) => void;
    onScrollRaw?: EventListener;
}

export class ScrollbarView extends View<IScrollBarProps, IScrollBarViewState> {
    public static readonly factory = () => new ScrollbarView();

    public mounting(props: Readonly<IScrollBarProps>): IScrollBarViewState {
        const root = template.clone() as HTMLElement;
        const content = template.get(root, "content") as HTMLElement;

        return this.updating(props, { root, content });
    }

    public updating(props: Readonly<IScrollBarProps>, state: Readonly<IScrollBarViewState>): IScrollBarViewState {
        const root = state.root;
        root.className = orientationToClass[props.orientation];

        if (state.onScrollRaw) {
            state.root.removeEventListener("scroll", state.onScrollRaw);
        }

        let onScrollRaw: undefined | (() => void);
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

        return state;
    }

    public unmounting(state: Readonly<IScrollBarViewState>) {
        if (state.onScrollRaw) {
            state.root.removeEventListener("scroll", state.onScrollRaw);
        }
    }

    private adjust(props: IScrollBarProps, length: number) {
        const delta = props.max - props.min;
        const size = length + delta;
        return `${size}px`;
    }

    private readonly onScrollVert = (state: Readonly<IScrollBarViewState>) => this.fireOnScroll(state, state.root.scrollTop);
    private readonly onScrollHoriz = (state: Readonly<IScrollBarViewState>) => this.fireOnScroll(state, state.root.scrollLeft);

    private readonly fireOnScroll = (state: Readonly<IScrollBarViewState>, value: number) => {
        value = Math.round(value);
        debug(`scrollbar: ${value}`);
        state.onScroll!(value);
    }
}
