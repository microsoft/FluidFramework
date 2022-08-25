/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISize, Rectangle } from "./geometry";

// Composition or inheritance for the below?

export abstract class Component {
    protected size = new Rectangle(0, 0, 0, 0);
    private readonly events = new EventEmitter();
    private children: Component[] = [];

    constructor(public element: HTMLDivElement) {
    }

    public on(event: "click", handler: (e: MouseEvent) => void): this;
    public on(event: "keypress" | "keydown", handler: (e: KeyboardEvent) => void): this;
    public on(event: "resize", handler: (size: Rectangle) => void): this;
    public on(event: string, listener: (...args: any[]) => void): this;
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

    /**
     * Allows the element to provide a desired size relative to the rectangle provided. By default returns
     * the provided size.
     */
    public measure(size: ISize): ISize {
        return size;
    }

    public resize(rectangle: Rectangle) {
        this.size = rectangle;
        this.resizeCore(rectangle);
        this.events.emit("resize", rectangle);
    }

    // For the child management functions we may want to just make the dervied class do this. Could help them
    // provide better context on their tracked nodes.

    protected addChild(component: Component, index = -1) {
        if (index === -1) {
            this.children.push(component);
        } else {
            this.children.splice(index, 0, component);
        }
    }

    protected removeChild(component: Component) {
        const index = this.children.lastIndexOf(component);
        if (index !== -1) {
            this.children.splice(index, 1);
        }
    }

    protected removeAllChildren() {
        this.children = [];
    }

    /**
     * Allows derived class to do custom processing based on the resize
     */
    protected resizeCore(rectangle: Rectangle) {
        return;
    }
}
