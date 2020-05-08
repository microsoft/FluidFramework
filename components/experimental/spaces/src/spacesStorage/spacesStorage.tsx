/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { Layout } from "react-grid-layout";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import {
    IComponent,
    IComponentHandle,
    IComponentLoadable,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

export interface ISpacesStorageModel extends EventEmitter {
    /**
     * The list of components being stored.
     */
    readonly componentList: Map<string, ISpacesStorageFormat>;
    /**
     * Adds the given item to the collector.
     * @param item - The item to add.
     * @returns A unique key corresponding to the added item.
     */
    addItem(item: ISpacesCollectible): string;
    /**
     * Removes the item specified by the given key.
     * @param key - The key referring to the item to remove.
     */
    removeItem(key: string): void;
    /**
     * Update the layout of the given item.
     * @param key - The item to update
     * @param newLayout - The item's new layout
     */
    updateLayout(key: string, newLayout: Layout): void;
}

export interface ISpacesStorageFormat {
    type: string;
    layout: Layout;
    handle: IComponentHandle;
}

/**
 * Spaces collects loadable components paired with a type.  The type is actually not generally needed except for
 * supporting export to template.
 */
export interface ISpacesCollectible {
    component: IComponent & IComponentLoadable;
    type: string;
    layout?: Layout;
}

/**
 * SpacesStorage is a component which maintains a collection of other components and a grid-based layout for rendering.
 */
export class SpacesStorage extends PrimedComponent implements
    IComponentHTMLView,
    ISpacesStorageModel
{
    public static get ComponentName() { return "@fluid-example/spaces-storage"; }

    private static readonly factory = new PrimedComponentFactory(
        SpacesStorage.ComponentName,
        SpacesStorage,
        [],
        {},
        [],
    );

    public static getFactory() {
        return SpacesStorage.factory;
    }

    public get IComponentHTMLView() { return this; }

    public get componentList(): Map<string, ISpacesStorageFormat> {
        return this.root;
    }

    public addItem(item: ISpacesCollectible): string {
        if (item.component.handle === undefined) {
            throw new Error(`Component must have a handle: ${item.type}`);
        }
        const model: ISpacesStorageFormat = {
            type: item.type,
            layout: item.layout ?? { x: 0, y: 0, w: 6, h: 2 },
            handle: item.component.handle,
        };
        this.root.set(item.component.url, model);
        return item.component.url;
    }

    public removeItem(key: string): void {
        this.root.delete(key);
    }

    public updateLayout(key: string, newLayout: Layout): void {
        const currentEntry = this.root.get<ISpacesStorageFormat>(key);
        const model = {
            type: currentEntry.type,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
            handle: currentEntry.handle,
        };
        this.root.set(key, model);
    }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        ReactDOM.render(
            <div>Figure it out</div>,
            div,
        );
    }

    protected async componentHasInitialized() {
        this.root.on("valueChanged", () => {
            // prob just need to re-render
            this.emit("componentListChanged", new Map(this.componentList.entries()));
        });
    }
}
