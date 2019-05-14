export interface IViewState {
    readonly root: Element;
}

export interface IView<TProps, TUpdatable> {
    attach(parent: Element, props: Readonly<TProps>): void;
    update(props: Readonly<TUpdatable>): void;
    detach(): void;
}

export abstract class View<TProps extends TUpdatable, TState extends IViewState, TUpdatable = TProps> implements IView<TProps, TUpdatable> {
    // tslint:disable-next-line:variable-name
    private _state?: TState;

    public attach(parent: Element, props: Readonly<TProps>) {
        this._state = this.onAttach(props);
        this.onUpdate(props, this.state);
        console.assert(parent.hasChildNodes() === false);
        parent.append(this.state.root);
    }

    public update(props: Readonly<TUpdatable>) {
        this.onUpdate(props, this.state);
    }

    public detach() {
        const parent = this.root.parentNode!;
        this.root.remove();
        this.onDetach(this.state);
        this._state = undefined;
        console.assert(parent.hasChildNodes() === false);
    }

    protected get root() { return this.state.root; }
    protected get state(): Readonly<TState> { return this._state!; }
    protected abstract onAttach(props: Readonly<TProps>): TState;
    protected abstract onUpdate(props: Readonly<TUpdatable>, state: TState): void;
    protected abstract onDetach(state: TState): void;

    protected updateState(state: Partial<TState>) {
        Object.assign(this._state, state);
    }
}
