export interface IComponent<TProps, TState> {
    mount(props: TProps): TState;
}

export interface IViewState {
    readonly root: Element;
}

export interface IView<TProps, TState extends IViewState> extends IComponent<TProps, TState> {
    mount(props: Readonly<TProps>): TState;
    update(props: Readonly<TProps>, state: Readonly<TState>): TState;
    unmount(state: Readonly<TState>): void;
}

export abstract class View<TProps, TState extends IViewState> implements IView<TProps, TState> {
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
