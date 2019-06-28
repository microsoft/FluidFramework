import { IViewState, View } from "..";
export declare enum ScrollbarOrientation {
    Horizontal = 0,
    Vertical = 1
}
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
export declare class ScrollbarView extends View<IScrollBarProps, IScrollBarViewState> {
    static readonly factory: () => ScrollbarView;
    mounting(props: Readonly<IScrollBarProps>): IScrollBarViewState;
    updating(props: Readonly<IScrollBarProps>, state: Readonly<IScrollBarViewState>): IScrollBarViewState;
    unmounting(state: Readonly<IScrollBarViewState>): void;
    private adjust;
    private readonly onScrollVert;
    private readonly onScrollHoriz;
    private readonly fireOnScroll;
}
//# sourceMappingURL=index.d.ts.map