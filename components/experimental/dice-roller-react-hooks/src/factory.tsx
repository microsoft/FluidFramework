import { ComponentHandle, ComponentRuntime } from "@fluidframework/component-runtime";
import { IComponentFactory, IComponentContext } from "@fluidframework/runtime-definitions";
import { SharedDirectory, ISharedDirectory } from "@fluidframework/map";

import React from "react";
import ReactDOM from "react-dom";

import { FluidContext, generateUseFluidState, generateUseFluidReducer } from "./FluidContext";

const rootMapKey = "root-map-key";

export function fluidReactComponentFactory(componentName: string, element: JSX.Element): IComponentFactory {
    let fluidObj;
    const instantiateComponent = (context: IComponentContext) => {
        const mapFactory = SharedDirectory.getFactory();
        const runtime = ComponentRuntime.load(context, new Map([[mapFactory.type, mapFactory]]));
        let rootP: Promise<ISharedDirectory>;
        if (!context.existing) {
            const root = SharedDirectory.create(runtime, rootMapKey);
            root.register();
            rootP = Promise.resolve(root);
        } else {
            rootP = runtime.getChannel(rootMapKey) as Promise<ISharedDirectory>;
        }
        runtime.registerRequestHandler(async () => {
            const root = await rootP;
            if (!fluidObj) {
                fluidObj = {
                    handle: undefined,
                    get IComponentHandle() {
                        if (!this.handle) {
                            this.handle = new ComponentHandle(this, runtime.path, runtime.IComponentHandleContext);
                        }
                        return this.handle;
                    },
                    get IComponentHTMLView() { return this; },
                    render(div: HTMLElement) {
                        const reactContext = {
                            useState: generateUseFluidState(root),
                            useReducer: generateUseFluidReducer(root),
                        };
                        ReactDOM.render(
                            <>
                                <h2> Running with Fluid Context </h2>
                                <FluidContext.Provider value={reactContext}>
                                    {element}
                                </FluidContext.Provider>
                                <h2> Running <b>without</b> Fluid Context </h2>
                                {element}
                            </>,
                            div);
                    },
                };
            }
            return {
                mimeType: "fluid/component",
                status: 200,
                value: fluidObj,
            };
        });
    }
    const createComponent = async (context: IComponentContext) => {
        return context.createComponentWithRealizationFn(componentName, instantiateComponent);
    }
    return {
        get IComponentFactory() { return this; },
        type: componentName,
        createComponent,
        instantiateComponent,
    };
}
