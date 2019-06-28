import { IViewState, View } from "..";
export interface IViewportProps {
    slot: Element;
    sizeY: number;
    offsetY: number;
    onScroll: (position: number) => void;
}
export interface IViewportViewState extends IViewState {
    props: IViewportProps;
    root: Element;
    transform: HTMLElement;
    slot: HTMLElement;
    origin: HTMLElement;
    space: HTMLElement;
    scrollPane: HTMLElement;
    sizeY: number;
    offsetY: number;
}
export declare class ViewportView extends View<IViewportProps, IViewportViewState> {
    readonly slotOriginTop: number;
    static readonly factory: () => ViewportView;
    mounting(props: Readonly<IViewportProps>): IViewportViewState;
    updating(props: Readonly<IViewportProps>, state: Readonly<IViewportViewState>): IViewportViewState;
    unmounting(state: Readonly<IViewportViewState>): void;
    private readonly onScroll;
}
//# sourceMappingURL=index.d.ts.map