export interface IViewState {
    readonly root: Element;
}

export interface IView<TProps> {
    mount(props: Readonly<TProps>): Element;
    update(props: Readonly<TProps>): void;
    unmount(): void;

    readonly root: Element;
}

export abstract class View<TProps, TState extends IViewState> implements IView<TProps> {
    private _state?: TState;

    protected get state(): Readonly<TState> { return this._state!; }

    public mount(props: Readonly<TProps>) {
        this._state = this.mounting(props);
        return this._state.root;
    }

    public update(props: Readonly<TProps>) {
        this._state = this.updating(props, this.state);
    }
    
    public unmount() {
        this.unmounting(this.state);
        this.root.remove();
        this._state = undefined;
    }

    public get root() { return this.state.root; }

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

export abstract class FlowViewComponent<TProps, TState extends IFlowViewComponentState>
    extends View<TProps, TState>
    implements IFlowViewComponent<TProps>
{
    public get cursorTarget() { return this.state.cursorTarget; }
}
