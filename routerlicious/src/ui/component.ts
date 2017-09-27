import { EventEmitter } from "events";
import { Rectangle } from "./geometry";

// Composition or inheritence for the below?

export abstract class Component {
    protected size: Rectangle;
    private events = new EventEmitter();
    private children: Component[] = [];

    constructor(public element: HTMLDivElement) {
    }

    public on(event: "keypress", handler: (e: KeyboardEvent) => void): this;
    public on(event: "keydown", handler: (e: KeyboardEvent) => void): this;
    public on(event: "resize", handler: (size: Rectangle) => void): this;
    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public emit(event: string, ...args: any[]) {
        this.events.emit(event, ...args);
        for (const child of this.children) {
            child.emit(event, ...args);
        }
    }

    public getChildren(): Component[] {
        // Probably will want a way to avoid providing direct access to the underlying array
        return this.children;
    }

    public resize(rectangle: Rectangle) {
        this.size = rectangle;
        this.resizeCore(rectangle);
        this.events.emit("resize", rectangle);
    }

    protected addChild(component: Component) {
        this.children.push(component);
    }

    protected removeChild(component: Component) {
        const index = this.children.lastIndexOf(component);
        if (index !== -1) {
            this.children.splice(index, 1);
        }
    }

    /**
     * Allows derived class to do custom processing based on the resize
     */
    protected resizeCore(rectangle: Rectangle) {
        return;
    }
}
