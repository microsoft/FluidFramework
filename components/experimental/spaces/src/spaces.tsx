/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as React from "react";
import * as ReactDOM from "react-dom";
import {
    PrimedComponent,
    PrimedComponentFactory,
} from "@microsoft/fluid-aqueduct";
import { IComponentHandle, IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IComponentHTMLView } from "@microsoft/fluid-view-interfaces";

import { FluidComponentMap } from "@microsoft/fluid-aqueduct-react";
import { SpacesStorage } from "./storage";
import { SpacesView } from "./spacesView";
import {
    IInternalRegistryEntry,
    ISpacesProps,
    SpacesStorageKey,
} from "./interfaces";
import { setTemplate, useReducer } from "./utils";
import { PrimedContext } from "./context";

/**
 * Spaces is the main component, which composes a SpacesToolbar with a SpacesStorage.
 */
export class Spaces extends PrimedComponent implements IComponentHTMLView {
    private storageComponent: SpacesStorage | undefined;
    private supportedComponents: IInternalRegistryEntry[] = [];
    private internalRegistry: IComponent | undefined;
    private fluidComponentMap: FluidComponentMap | undefined;

    public static get ComponentName() { return "@fluid-example/spaces"; }

    private static readonly factory = new PrimedComponentFactory(
        Spaces.ComponentName,
        Spaces,
        [],
        {},
        [[ SpacesStorage.ComponentName, Promise.resolve(SpacesStorage.getFactory()) ]],
    );

    public static getFactory() {
        return Spaces.factory;
    }

    public get IComponentHTMLView() { return this; }

    /**
     * Will return a new Spaces View
     */
    public render(div: HTMLElement) {
        if (this.storageComponent === undefined || this.fluidComponentMap === undefined) {
            throw new Error("Spaces can't render, storage not found");
        }

        ReactDOM.render(
            <SpacesApp
                root={this.root}
                runtime={this.runtime}
                initialFluidState={{}}
                initialViewState={{}}
                fluidComponentMap={this.fluidComponentMap}
                supportedComponents={this.supportedComponents}
                syncedStorage={this.storageComponent}
                componentRegistry={this.internalRegistry?.IComponentRegistry}
            />,
            div,
        );
    }

    protected async componentInitializingFirstTime() {
        const storageComponent = await this.createAndAttachComponent<SpacesStorage>(SpacesStorage.ComponentName);
        this.root.set(SpacesStorageKey, storageComponent.handle);
        // Set the saved template if there is a template query param
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has("template")) {
            await setTemplate(storageComponent);
        }
        this.fluidComponentMap = new Map();
        this.fluidComponentMap.set(storageComponent.handle.path, { component: storageComponent });
    }

    protected async componentHasInitialized() {
        const storageComponent = await this.root.get<IComponentHandle<SpacesStorage>>(SpacesStorageKey)?.get();
        this.internalRegistry = await this.context.containerRuntime.IComponentRegistry.get("") as IComponent;

        if (this.internalRegistry) {
            const internalRegistry = this.internalRegistry.IComponentInternalRegistry;
            if (internalRegistry) {
                this.supportedComponents = internalRegistry.getFromCapability("IComponentHTMLView");
            }
        }

        this.fluidComponentMap = new Map();
        this.fluidComponentMap.set(storageComponent.handle.path, { component: storageComponent });
        const fetchInitialComponentP: Promise<void>[] = [];
        storageComponent.componentList.forEach((value, key) => {
            const fetchComponentP = value.handle.get().then((component) => {
                if (component.handle) {
                    this.fluidComponentMap?.set(component.handle.path, { component });
                }
            });
            fetchInitialComponentP.push(fetchComponentP);
            return;
        });
        await Promise.all(fetchInitialComponentP);
        this.storageComponent = storageComponent;
    }
}

function SpacesApp(props: ISpacesProps) {
    const [state, reducer, selector] = useReducer(props);
    return (
        <div>
            <PrimedContext.Provider
                value={{
                    reducer,
                    selector,
                    state,
                    supportedComponents: props.supportedComponents,
                }}
            >
                <SpacesView/>
            </PrimedContext.Provider>
        </div>
    );
}
