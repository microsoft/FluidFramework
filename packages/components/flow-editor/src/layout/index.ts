/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

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

    protected syncCss(element: HTMLElement, props: { style?: string, classList?: string }, className?: string) {
        const { style, classList } = props;

        // Note: Similar to TokenList.set(), but elides the search to see if 'className' is already in 'classList'.
        const classes = !classList
            ? className                             // If classList is undefined/empty, use 'className'
            : !className
                ? classList                         // If className is undefined/empty, use 'classList'
                : `${className} ${classList}`;      // Otherwise prepend 'className' to 'classList'

        if (!areStringsEquivalent(classes, element.className)) {
            element.className = classes;
        }
        if (!areStringsEquivalent(style, element.style.cssText)) {
            element.style.cssText = style;
        }
    }
}

export interface IFlowViewComponent<TProps> extends IView<TProps> {
    readonly slot: Element;
    caretBoundsToSegmentOffset(x: number, top: number, bottom: number): number;
    segmentOffsetToNodeAndOffset(offset: number): { node: Node, nodeOffset: number };
}

export abstract class FlowViewComponent<TProps, TState extends IViewState>
    extends View<TProps, TState>
    implements IFlowViewComponent<TProps> {
    public abstract caretBoundsToSegmentOffset(x: number, top: number, bottom: number): number;
    public abstract segmentOffsetToNodeAndOffset(offset: number): { node: Node, nodeOffset: number };
    public get slot() { return this.root; }
}
