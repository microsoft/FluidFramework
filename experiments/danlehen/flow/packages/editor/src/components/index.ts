export interface IViewState {
    readonly root: Element;
}

export abstract class View<TProps, TState extends IViewState> {
    private _state?: TState;

    public get state(): Readonly<TState> { return this._state!; }

    protected setState(state: TState) {
        this._state = state;
    }

    public mount(props: Readonly<TProps>) {
        this._state = this.mounting(props);
    }

    public update(props: Readonly<TProps>) {
        this._state = this.updating(props, this.state);
    }
    
    public unmount() {
        this.unmounting(this.state);
        this._state = undefined;
    }

    protected abstract mounting(props: Readonly<TProps>): TState;
    protected abstract updating(props: Readonly<TProps>, state: TState): TState;
    protected abstract unmounting(state: TState): void;
}
