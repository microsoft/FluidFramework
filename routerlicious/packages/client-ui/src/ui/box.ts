/**
 * A box component to be displayed inline inside a FlowView.  Note that instances are
 * singletons w/their persisted state and UI services passed to them as needed.
 */
export abstract class Box<TState> {
    // TODO: font & services should be passed as part of a component-standard 'LayoutContent'
    // TODO: Likely should follow the CSS box model returning a min/max width.
    /** Returns the desired width of a inline box. */
    public abstract measure(self: TState, services: Map<string, any>, font: string): number;

    // TODO: services should be passed as part of a component-standard 'RenderContent'
    /** Returns the emitted HTML of an inline box. */
    public abstract render(self: TState, services: Map<string, any>): HTMLElement;

    /** Return true if this box should be treated as a paragraph. */
    public get isParagraph() { return false; }
}
