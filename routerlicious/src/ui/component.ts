import { EventEmitter } from "events";
import { Rectangle } from "./geometry";

export interface IComponent {
    // DOM element this node is attached to
    element: HTMLDivElement;

    /**
     * Component event handlers - including strongly typed overrides
     */
    on(event: "keypress", handler: (e: KeyboardEvent) => void): this;
    on(event: "keydown", handler: (e: KeyboardEvent) => void): this;
    on(event: "resize", handler: (size: Rectangle) => void): this;
    on(event: string, listener: (...args: any[]) => void): this;
}

// Can I make use of composition below rather than inheritence?

export abstract class Component implements IComponent {
    protected size: Rectangle;
    private events = new EventEmitter();
    private children: IComponent[] = [];

    constructor(public element: HTMLDivElement) {
    }

    public on(event: "keypress", handler: (e: KeyboardEvent) => void): this;
    public on(event: "keydown", handler: (e: KeyboardEvent) => void): this;
    public on(event: "resize", handler: (size: Rectangle) => void): this;
    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public getChildren(): IComponent[] {
        // Probably will want a way to avoid providing direct access to the underlying array
        return this.children;
    }

    public resize(rectangle: Rectangle) {
        this.size = rectangle;
        this.resizeCore(rectangle);
        this.events.emit("resize", rectangle);
    }

    protected addChild(component: IComponent) {
        this.children.push(component);
    }

    protected removeChild(component: IComponent) {
        const index = this.children.lastIndexOf(component);
        if (index !== -1) {
            this.children.splice(index, 1);
        }
    }

    /**
     * Allows derived class to do custom processing based on the resize
     */
    protected abstract resizeCore(rectangle: Rectangle);
}
