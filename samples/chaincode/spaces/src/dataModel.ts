/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

import { EventEmitter } from "events";
import { ISharedDirectory, IDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import {
    IComponent,
} from "@microsoft/fluid-component-core-interfaces";
import { ClickerName } from "@fluid-example/clicker";
import { Layout } from "react-grid-layout";

type supportedComponent =
    "button"
    | "clicker"
    | "number"
    | "textbox"
    | "facepile"
    | "codemirror"
    | "prosemirror";

export interface ISpacesDataModel extends EventEmitter {
    componentList: Map<string, Layout>;
    addComponent(type: supportedComponent, w?: number, h?: number): Promise<void>;
    getComponent(id: string): Promise<IComponent>;
    removeComponent(id: string): void;
    updateGridItem(id: string, newLayout: Layout): void;
    getLayout(id: string): Layout;
    saveLayout(): void;
    setTemplate(): Promise<void>;
}

/**
 * The Data Model is an abstraction layer so the React View doesn't need to interact directly with fluid.
 */
export class SpacesDataModel extends EventEmitter implements ISpacesDataModel {
    private readonly componentSubDirectory: IDirectory;

    constructor(
        private readonly root: ISharedDirectory,
        private readonly createAndAttachComponent: (id: string, pkg: string, props?: any) => Promise<IComponent>,
        public getComponent: (id: string) => Promise<IComponent>,
    ) {
        super();

        this.componentSubDirectory = this.root.getSubDirectory("component-list");

        root.on("valueChanged", (changed: IDirectoryValueChanged, local: boolean) => {
            // If we don't have this then moving locally is broken
            if (changed.path === this.componentSubDirectory.absolutePath) {
                this.emit("componentListChanged", this.componentList);
            }
        });
    }

    /**
     * Registers a listener on the specified events
     */
    public on(
        event: "componentListChanged",
        listener: (componentIds: Map<string, Layout>) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    public get componentList(): Map<string, Layout> {
        const response: Map<string, Layout> = new Map();
        this.componentSubDirectory.forEach((value: ISpacesModel, key) => {
            response.set(key, value.layout);
        });
        return response;
    }

    public async addComponent(type: supportedComponent, w: number = 1, h: number = 1): Promise<void> {
        const defaultLayout = { x: 0, y: 0, w, h };
        return this.addComponentInternal(type, defaultLayout);
    }

    public async removeComponent(id: string) {
        this.componentSubDirectory.delete(id);
    }

    public updateGridItem(id: string, newLayout: Layout): void {
        const currentEntry = this.componentSubDirectory.get<ISpacesModel>(id);
        const model = {
            type: currentEntry.type,
            layout: { x: newLayout.x, y: newLayout.y, w: newLayout.w, h: newLayout.h },
        };
        this.componentSubDirectory.set(id, model);
    }

    public getLayout(id: string): Layout {
        const entry = this.componentSubDirectory.get<ISpacesModel>(id);
        return entry.layout;
    }

    public saveLayout(): void {
        const value = this.componentSubDirectory.values();
        localStorage.setItem("spacesTemplate", JSON.stringify([...value]));
    }

    public async setTemplate(): Promise<void> {
        const size = this.componentSubDirectory.size;
        if (size > 0) {
            console.log("Can't set template because there is already components");
            return;
        }

        const templateString = localStorage.getItem("spacesTemplate");
        if (templateString) {
            const template = JSON.parse(templateString) as ISpacesModel[];
            const promises: Promise<void>[] = [];
            template.forEach((value) => {
                promises.push(this.addComponentInternal(value.type as supportedComponent, value.layout));
            });

            await Promise.all(promises);
        }
    }

    private async addComponentInternal(type: supportedComponent, layout: Layout): Promise<void> {
        let pkg = "";
        switch (type) {
            case "clicker":
                pkg = ClickerName;
                break;
            default:
                pkg = type;
                break;
        }

        const defaultModel: ISpacesModel = {
            type,
            layout,
        };

        const id = `${type}-${Date.now()}`;
        this.componentSubDirectory.set(id, defaultModel);
        await this.createAndAttachComponent(id, pkg);
    }
}

interface ISpacesModel {
    type: string;
    layout: Layout;
}
