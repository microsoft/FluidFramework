/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ISharedDirectory, IDirectory, IDirectoryValueChanged } from "@microsoft/fluid-map";
import {
    IComponent, IComponentLoadable, IComponentHandle,
} from "@microsoft/fluid-component-core-interfaces";
import { IComponentCollection } from "@microsoft/fluid-framework-interfaces";
import { Layout } from "react-grid-layout";


export interface ISpacesDataModel extends EventEmitter {
    componentList: Map<string, Layout>;
    setComponentToolbar(id: string, type: string, url: string): Promise<IComponent>;
    setComponent(id: string, type: string, url: string): Promise<IComponent>;
    getComponentToolbar(): Promise<IComponent>;
    addComponent<T extends IComponent & IComponentLoadable>(
        type: string,
        w?: number,
        h?: number,
        id?: string
    ): Promise<T>;
    getComponent<T extends IComponent>(id: string): Promise<T | undefined>;
    removeComponent(id: string): void;
    updateGridItem(id: string, newLayout: Layout): void;
    getLayout(id: string): Layout;
    saveLayout(): void;
    setTemplate(): Promise<void>;
    componentToolbarId: string;
    IComponentCollection: IComponentCollection;
    createCollectionItem<ISpacesCollectionOptions>(options: ISpacesCollectionOptions): IComponent;
    removeCollectionItem(item: IComponent): void;
}

interface ISpacesCollectionOptions {
    id?: string;
    type?: string;
}

/**
 * The Data Model is an abstraction layer so the React View doesn't need to interact directly with fluid.
 */
export class SpacesDataModel extends EventEmitter implements ISpacesDataModel, IComponentCollection {
    private readonly componentSubDirectory: IDirectory;

    constructor(
        private readonly root: ISharedDirectory,
        private readonly createAndAttachComponent: <T extends IComponent & IComponentLoadable>(
            pkg: string,
            props?: any) => Promise<T>,
        private readonly getComponent_UNSAFE: <T>(id: string) => Promise<T>,
        public componentToolbarId: string,
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

    public get IComponentCollection() { return this; }

    public createCollectionItem<T>(rawOptions: T): IComponent {
        const options = rawOptions as ISpacesCollectionOptions;
        if (!options.id || !options.type){
            throw new Error("Tried to create a collection item in Spaces with invalid options");
        }
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.setComponent(options.id, options.type);
        // This is okay as we are not using the value returned from this function call anywhere
        // Instead, setComponent adds it to the sequence to be synchronously loaded
        const emptyComponent: IComponent = {};
        return emptyComponent;
    }

    public removeCollectionItem(instance: IComponent): void {
        let componentUrl: string;
        if (instance.IComponentLoadable) {
            componentUrl = instance.IComponentLoadable.url;
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.removeComponent(componentUrl);
        }
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
            const component = await this.getComponent<IComponent>(id);
            const defaultModel: ISpacesModel = {
                type,
                layout: { x: 0, y: 0, w: 6, h: 2 },
                handleOrId: id,
            };
            if (component) {
                this.componentSubDirectory.set(id, defaultModel);
                return component;
            } else {
                throw new Error(`Runtime does not contain component with id: ${id}`);
            }
        });
    }

    public async getComponentToolbar(): Promise<IComponent> {
        const component = await this.getComponent(this.componentToolbarId);
        return component as IComponent;
    }

    public async setComponent(id: string, type: string): Promise<IComponent> {
        const defaultModel: ISpacesModel = {
            type,
            layout: { x: 0, y: 0, w: 6, h: 2 },
        };
        return this.getComponent<IComponent>(id)
            .then((returnedComponent) => {
                if (returnedComponent) {
                    if (returnedComponent.IComponentLoadable) {
                        this.componentSubDirectory.set(id, defaultModel);
                        return returnedComponent;
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
    }

    public async addComponent<T extends IComponent & IComponentLoadable>(
        type: string,
        w: number = 1,
        h: number = 1,
        id?: string,
    ): Promise<T> {
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
            handleOrId: currentEntry.handleOrId,
        };
        this.componentSubDirectory.set(id, model);
    }

    public async getComponent<T extends IComponent>(id: string): Promise<T | undefined> {
        const data = this.componentSubDirectory.get<ISpacesModel>(id);
        if (data && typeof data.handleOrId === "string") {
            return this.getComponent_UNSAFE<T>(data.handleOrId);
        } else if (data && data.handleOrId) {
            return this.getComponentById<T>(data.handleOrId as IComponentHandle);
        } else {
            return this.getComponent_UNSAFE<T>(id);
        }
    }

    private async getComponentById<T>(handle: IComponentHandle): Promise<T> {
        // We have to do this bit of hackery because in handles.ts, there is a note
        // about constraining the handle's T to IComponent & IComponentLoadable
        // Since getComponent above doesn't restrict T to IComponentLoadable, we cannot set
        // the type there
        return await handle.get() as unknown as T;
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

    private async addComponentInternal<T extends IComponent & IComponentLoadable>(
        type: string,
        layout: Layout,
        id = `${type}-${Date.now()}`): Promise<T> {
        const component = await this.createAndAttachComponent<T>(type);
        const defaultModel: ISpacesModel = {
            type,
            layout,
            handleOrId: component.handle,
        };
        this.componentSubDirectory.set(id, defaultModel);
        return component;
    }
}

interface ISpacesModel {
    type: string;
    layout: Layout;
    handleOrId?: IComponentHandle | string;
}
