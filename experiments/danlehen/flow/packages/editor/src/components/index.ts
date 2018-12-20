export interface IViewState {
    readonly root: Element;
}

export abstract class View<TProps, TState extends IViewState> {
    constructor() { }

    public mount(props: TProps): TState {
        return this.mounting(props);
    }

    public unmount(state: TState) {
        this.unmounting(state);
    }

    public update(props: TProps, state: TState) {
        return this.updating(props, state);
    }

    protected abstract mounting(props: TProps): TState;
    protected abstract updating(props: TProps, state: TState): TState;
    protected abstract unmounting(state: TState): void;
}
