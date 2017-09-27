import { EventEmitter } from "events";
import { Rectangle } from "./geometry";

export interface IComponent {
    /**
     * Component event handlers - including strongly typed overrides
     */
    on(event: "keypress", handler: (e: KeyboardEvent) => void);
    on(event: "keydown", handler: (e: KeyboardEvent) => void);
    on(event: "resize", handler: (size: Rectangle) => void);
    on(event: string, handler: Function);

    /**
     * Notifies the component of a size change
     */
    resize(rectangle: Rectangle);

    /**
     * Retrieves all the child elements of this component
     */
    getChildren(): IComponent[];
    addChild(component: IComponent);
    removeChild(component: IComponent);
}

// Can I make use of composition below rather than inheritence?

export abstract class Component implements IComponent {
    private events = new EventEmitter();
    private children: IComponent[] = [];

    constructor(public element: HTMLDivElement) {
    }

    public on(event: "keypress", handler: (e: KeyboardEvent) => void);
    public on(event: "keydown", handler: (e: KeyboardEvent) => void);
    public on(event: "resize", handler: (size: Rectangle) => void);
    public on(event: string, handler: Function) {
        throw new Error("Method not implemented.");
    }

    public getChildren(): IComponent[] {
        // Probably will want a way to avoid providing direct access to the underlying array
        return this.children;
    }

    public addChild(component: IComponent) {
        this.children.push(component);
    }

    public removeChild(component: IComponent) {
        const index = this.children.lastIndexOf(component);
        if (index !== -1) {
            this.children.splice(index, 1);
        }
    }

    public resize(rectangle: Rectangle) {
        this.resizeCore(rectangle);
        this.events.emit("resize", rectangle);
    }

    /**
     * Allows derived class to do custom processing based on the resize
     */
    protected abstract resizeCore(rectangle: Rectangle);
}
