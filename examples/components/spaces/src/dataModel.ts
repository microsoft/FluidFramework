/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISharedDirectory, IDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import {
    IComponent,
} from "@microsoft/fluid-component-core-interfaces";
import { Layout } from "react-grid-layout";
import { SharedObjectSequence } from "@microsoft/fluid-sequence";


export interface ISpacesDataModel extends EventEmitter {
    componentList: Map<string, Layout>;
    addComponent<T>(type: string, w?: number, h?: number, id?: string): Promise<T>;
    setComponentToolbar(id: string, type: string, url: string): Promise<IComponent>;
    setComponent(id: string, type: string, url: string): IComponent;
    getComponentToolbar(): Promise<IComponent>;
    getComponent<T>(id: string): Promise<T>;
    removeComponent(id: string): void;
    updateGridItem(id: string, newLayout: Layout): void;
    getLayout(id: string): Layout;
    saveLayout(): void;
    setTemplate(): Promise<void>;
    componentToolbarId: string;
}

/**
 * The Data Model is an abstraction layer so the React View doesn't need to interact directly with fluid.
 */
export class SpacesDataModel extends EventEmitter implements ISpacesDataModel {
    private readonly componentSubDirectory: IDirectory;


    constructor(
        private readonly root: ISharedDirectory,
        private readonly createAndAttachComponent: <T>(id: string, pkg: string, props?: any) => Promise<T>,
        public getComponent: <T>(id: string) => Promise<T>,
        public componentToolbarId: string,
        private readonly sequence: SharedObjectSequence<string>,
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

    public async setComponentToolbar(
        id: string,
        type: string,
        url: string): Promise<IComponent> {
        return this.removeComponent(this.componentToolbarId).then(async () => {
            this.componentToolbarId = id;
            const component = await this.getComponent(id);
            const defaultModel: ISpacesModel = {
                type,
                layout: { x: 0, y: 0, w: 6, h: 2 },
            };
            if (component) {
                this.componentSubDirectory.set(id, defaultModel);
                return component as IComponent;
            } else {
                throw new Error(`Runtime does not contain component with id: ${id}`);
            }
        });
    }

    public async getComponentToolbar(): Promise<IComponent> {
        const component = await this.getComponent(this.componentToolbarId);
        return component as IComponent;
    }

    public setComponent(id: string, type: string, url: string): IComponent {
        const defaultModel: ISpacesModel = {
            type,
            layout: { x: 0, y: 0, w: 6, h: 2 },
        };
        // TODO: Figure out how to use loadable component and sequence, and type this correctly
        // line 115-133 use this, current code path is 134-140
        //let loadableComponent: IComponentLoadable;
        this.getComponent<IComponent>(url)
            .then((returnedComponent) => {
                if (returnedComponent) {
                    if (returnedComponent.IComponentLoadable) {
                        this.componentSubDirectory.set(id, defaultModel);
                        this.sequence.insert(this.sequence.getLength(), [url]);
                        // loadableComponent = { url, IComponentLoadable: component.IComponentLoadable };
                    } else {
                        throw new Error("Component is not an instance of IComponentLoadable!!");
                    }
                } else {
                    throw new Error(`Runtime does not contain component with id: ${id}`);
                }
            })
            .catch((error) => {
                throw error;
            });
        // return loadableComponent;
        const component = this.getComponent(id);
        if (component) {
            this.componentSubDirectory.set(id, defaultModel);
            return component as IComponent;
        } else {
            throw new Error(`Runtime does not contain component with id: ${id}`);
        }
    }

    public async addComponent<T>(type: string, w: number = 1, h: number = 1, id?: string): Promise<T> {
        const defaultLayout = { x: 0, y: 0, w, h };
        return this.addComponentInternal<T>(type, defaultLayout, id);
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
            const promises: Promise<IComponent>[] = [];
            template.forEach((value) => {
                promises.push(this.addComponentInternal(value.type, value.layout));
            });

            await Promise.all(promises);
        }
    }

    private async addComponentInternal<T>(
        type: string,
        layout: Layout,
        id = `${type}-${Date.now()}`): Promise<T> {

        const defaultModel: ISpacesModel = {
            type,
            layout,
        };
        this.componentSubDirectory.set(id, defaultModel);
        return this.createAndAttachComponent<T>(id, type);
    }
}

interface ISpacesModel {
    type: string;
    layout: Layout;
}
