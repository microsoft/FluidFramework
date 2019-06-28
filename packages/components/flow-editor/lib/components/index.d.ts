export interface IViewState {
    readonly root: Element;
}
export interface IView<TProps> {
    readonly root: Element;
    mount(props: Readonly<TProps>): Element;
    update(props: Readonly<TProps>): void;
    unmount(): void;
}
export declare abstract class View<TProps, TState extends IViewState> implements IView<TProps> {
    private _state?;
    protected readonly state: Readonly<TState>;
    mount(props: Readonly<TProps>): Element;
    update(props: Readonly<TProps>): void;
    unmount(): void;
    readonly root: TState["root"];
    protected abstract mounting(props: Readonly<TProps>): TState;
    protected abstract updating(props: Readonly<TProps>, state: TState): TState;
    protected abstract unmounting(state: TState): void;
}
export interface IFlowViewComponentState extends IViewState {
    cursorTarget: Node;
}
export interface IFlowViewComponent<TProps> extends IView<TProps> {
    readonly cursorTarget: Node;
}
export declare abstract class FlowViewComponent<TProps, TState extends IFlowViewComponentState> extends View<TProps, TState> implements IFlowViewComponent<TProps> {
    readonly cursorTarget: TState["cursorTarget"];
}
//# sourceMappingURL=index.d.ts.map