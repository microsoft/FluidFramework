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