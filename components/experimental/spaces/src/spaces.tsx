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
    ISpacesStoredComponent,
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
        if (this.storageComponent === undefined) {
            throw new Error("Spaces can't render, storage not found");
        }
        const fluidComponentMap: FluidComponentMap = new Map();
        fluidComponentMap.set(this.storageComponent.handle, { component: this.storageComponent });

        const localComponentMap = new Map<string, ISpacesStoredComponent>();

        ReactDOM.render(
            <SpacesApp
                root={this.root}
                runtime={this.runtime}
                localComponentMap={localComponentMap}
                fluidComponentMap={fluidComponentMap}
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
    }

    protected async componentHasInitialized() {
        this.storageComponent = await this.root.get<IComponentHandle<SpacesStorage>>(SpacesStorageKey)?.get();
        this.internalRegistry = await this.context.containerRuntime.IComponentRegistry.get("") as IComponent;

        if (this.internalRegistry) {
            const internalRegistry = this.internalRegistry.IComponentInternalRegistry;
            if (internalRegistry) {
                this.supportedComponents = internalRegistry.getFromCapability("IComponentHTMLView");
            }
        }
    }
}

function SpacesApp(props: ISpacesProps) {
    const [state, dispatch, fetch] = useReducer(props);
    return (
        <div>
            <PrimedContext.Provider
                value={{
                    dispatch,
                    fetch,
                    state,
                    supportedComponents: props.supportedComponents,
                }}
            >
                <SpacesView/>
            </PrimedContext.Provider>
        </div>
    );
}
