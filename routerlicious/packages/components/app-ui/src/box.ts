export enum BoxKind {
    /** Block elements force a paragraph break and take all remaining horizontal space. */
    Block           = 0,

    /** Inline are laid out inline in the current flow. */
    Inline          = 1,
}

export enum BoxFlags {
    /** Initial unmounted state. */
    None            = 0,

    /** Box is currently mounted into the DOM. */
    Mounted         = 1,
}

/** Private key for 'flags' property in BoxState. */
const flagsSymbol = Symbol();

export abstract class BoxState {
    /** The currently set BoxFlags, if any. */
    public [flagsSymbol]: BoxFlags;
}

/** Used to specify modified CSS styles. */
export interface IBoxStyle {
    /** See https://developer.mozilla.org/en-US/docs/Web/CSS/font */
    font?: string;
}

/** Used to retrieve the current effective CSS styles. */
export interface IBoxStyleContext {
    readonly font: string;
}

/** Internal class used to calculate the current effective style. */
class BoxStyle implements IBoxStyleContext {
    private readonly stack: IBoxStyle[] = [];

    constructor(style: IBoxStyle) {
        this.stack.push(style);
    }

    /** See https://developer.mozilla.org/en-US/docs/Web/CSS/font */
    public get font(): string {
        return this.memoizedLookup("font", "");
    }

    public push(style: IBoxStyle) {
        this.stack.push(style);
    }

    public pop() {
        this.stack.pop();
    }

    private memoizedLookup(property: string, defaultValue: any) {
        // If the value is already cached at the top of the stack, early exit.
        const top = this.stack[this.stack.length - 1] as any;
        if (top.hasOwnProperty(property)) {
            return top[property];
        }

        // Otherwise run the stack, looking for the nearest ancestor with a cached value.
        for (let i = this.stack.length - 2; i >= 0; i--) {
            const ancestor = this.stack[i] as any;
            if (ancestor.hasOwnProperty(property)) {
                const inheritedValue = ancestor[property];
                top[property] = inheritedValue;
                return inheritedValue;
            }
        }

        // No ancestor had a value for this property, assign the default.
        top[property] = defaultValue;
        return defaultValue;
    }
}

/** Layout/render context for the Box, used during mount/update/unmount. */
export abstract class BoxContext {
    private readonly styleContext: BoxStyle;

    constructor(private readonly measure2d: CanvasRenderingContext2D, style: IBoxStyle) {
        this.styleContext = new BoxStyle(style);
    }

    /** Current effective CSS style. */
    public get style(): IBoxStyleContext { return this.styleContext; }

    /** Measures the given 'text' using the current effective CSS style. */
    public measureText(text: string) {
        // TODO: Consider push/pop state abstraction to help avoid state leaks.
        this.measure2d.font = this.style.font;

        // TODO: Consider caching the result
        return this.measure2d.measureText(text);
    }

    /** Applies the given style modifications for the scope of the callback. */
    public withStyle(style: IBoxStyle, scope: () => void) {
        this.styleContext.push(style);
        try {
            scope();
        } finally {
            this.styleContext.pop();
        }
    }
}

/** Base class for Block/Inline components. */
export abstract class Box<TSelf extends BoxState> {
    constructor(public readonly boxKind: BoxKind) { }

    /** Mounts this component if element is undefined, otherwise updates the existing component. */
    public upsert(self: TSelf, context: BoxContext, element: HTMLElement | undefined) {
        console.assert((element !== undefined) === this.isMounted(self));

        return (element === undefined
            ? this.mount(self, context)
            : this.update(self, context, element));
    }

    /**
     * Mounts this component, returning an HTMLElement for the caller to parent attach to their
     * DOM subtree.
     */
    public mount(self: TSelf, context: BoxContext) {
        console.assert(!this.isMounted(self));

        const element = this.mounting(self, context);
        this.setFlag(self, BoxFlags.Mounted);
        return element;
    }

    /**
     * Unmounts this component from the given HTMLElement.
     */
    public unmount(self: BoxState, context: BoxContext, element: HTMLElement) {
        console.assert(this.isMounted(self));

        element.remove();
        this.unmounting(self, context, element);
        this.clearFlag(self, BoxFlags.Mounted);
    }

    /**
     * Updates the component mounted at the given element.
     */
    public update(self: TSelf, context: BoxContext, element: HTMLElement) {
        console.assert(this.isMounted(self));

        return this.updating(self, context, element);
    }

    /**
     * Implemented by Box subclasses to create and return a new DOM subtree for the
     * component represented by 'self'.
     *
     * @param self The component's state.
     * @param context Render/layout context.
     */
    protected abstract mounting(self: TSelf, context: BoxContext): HTMLElement;

    /**
     * NYI: FlowView does not yet unmount components when removing them.
     */
    protected abstract unmounting(self: BoxState, context: BoxContext, element: HTMLElement): void;

    /**
     * Implemented by Box subclasses to update their DOM subtree to reflect any changes
     * to the current state.
     *
     * @param self The component's state.
     * @param context Render/layout context.
     * @param element The root of this component's DOM subtree.
     */
    protected abstract updating(self: TSelf, context: BoxContext, element: HTMLElement): HTMLElement;

    // tslint:disable:no-bitwise
    private isFlagSet(self: BoxState, mask: BoxFlags)   { return (self[flagsSymbol] & mask) === mask; }
    private setFlag(self: BoxState, mask: BoxFlags)     { self[flagsSymbol] |= mask; }
    private clearFlag(self: BoxState, mask: BoxFlags)   { self[flagsSymbol] &= ~mask; }
    // tslint:disable:no-bitwise

    private isMounted(self: BoxState)                   { return this.isFlagSet(self, BoxFlags.Mounted); }
}
