/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ComponentHandle, ComponentRuntime } from "@fluidframework/component-runtime";
import { IComponentFactory, IComponentContext } from "@fluidframework/runtime-definitions";
import { AsJsonable, JsonablePrimitive } from "@fluidframework/component-runtime-definitions";
import { SharedMap, ISharedMap, IDirectoryValueChanged } from "@fluidframework/map";

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

import { FluidMapContext } from "./useFluidMap";

const rootMapKey = "root-map-key";

function generateUseFluidMap(map: ISharedMap) {
    return function <T = JsonablePrimitive>(key: string, initialValue?: AsJsonable<T>)
        : [T, <T2 = JsonablePrimitive>(value: AsJsonable<T2>) => void] {
        const currentValue = map.get(key) ?? initialValue;
        const [state, setState] = useState(currentValue);

        useEffect(() => {
            const onValueChanged = (changed: IDirectoryValueChanged) => {
                if (changed.key === key) {
                    setState(map.get(key));
                }
            };
            map.on("valueChanged", onValueChanged);
            return () => {
                map.off("valueChanged", onValueChanged);
            };
        }, [state]);

        return [state, (value) => map.set(key, value)];
    }
}

export function fluidReactComponentFactory(componentName: string, element: JSX.Element): IComponentFactory {
    let fluidObj;
    const instantiateComponent = (context) => {
        const mapFactory = SharedMap.getFactory();
        const runtime = ComponentRuntime.load(context, new Map([[mapFactory.type, mapFactory]]));
        let rootP: Promise<ISharedMap>;
        if (!context.existing) {
            const root = SharedMap.create(runtime, rootMapKey);
            root.register();
            rootP = Promise.resolve(root);
        } else {
            rootP = runtime.getChannel(rootMapKey) as Promise<ISharedMap>;
        }
        runtime.registerRequestHandler(async () => {
            let root: ISharedMap = await rootP;
            if (!fluidObj) {
                fluidObj = {
                    handle: undefined,
                    get IComponentHandle() { 
                        if (!this.handle) {
                            this.handle = new ComponentHandle(this, context.path, runtime.IComponentHandleContext);
                        }
                        return this.handle;
                    },
                    get IComponentHTMLView() { return this; },
                    render(div: HTMLElement) {
                        ReactDOM.render(
                            <FluidMapContext.Provider value={generateUseFluidMap(root)}>
                                {element}
                            </FluidMapContext.Provider>,
                            div
                        )
                    }
                }
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
