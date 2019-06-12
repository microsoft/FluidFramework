import { areStringsEquivalent } from "@prague/flow-util";

export interface IViewState {
    readonly root: Element;
}

export interface IView<TProps> {
    readonly root: Element;
    mount(props: Readonly<TProps>): Element;
    update(props: Readonly<TProps>): void;
    unmount(): void;
}

export abstract class View<TProps, TState extends IViewState> implements IView<TProps> {
    // tslint:disable-next-line:variable-name
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
        this.root.remove();
        this.unmounting(this.state);
        this._state = undefined;
    }

    public get root() { return this.state.root; }

    protected abstract mounting(props: Readonly<TProps>): TState;
    protected abstract updating(props: Readonly<TProps>, state: TState): TState;
    protected abstract unmounting(state: TState): void;

    protected syncCss(element: HTMLElement, classList: string | undefined, style: string | undefined) {
        if (!areStringsEquivalent(classList, element.className)) {
            element.className = classList;
        }
        if (!areStringsEquivalent(style, element.style.cssText)) {
            element.style.cssText = style;
        }
    }
}

export interface IFlowViewComponent<TProps> extends IView<TProps> {
    readonly cursorTarget: Node;
}

export abstract class FlowViewComponent<TProps, TState extends IViewState>
    extends View<TProps, TState>
    implements IFlowViewComponent<TProps> {
    public abstract get cursorTarget(): Node;
}
