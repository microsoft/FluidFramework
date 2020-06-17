import { ComponentHandle, ComponentRuntime } from "@fluidframework/component-runtime";
import { IComponentFactory, IComponentContext } from "@fluidframework/runtime-definitions";
import { AsJsonable } from "@fluidframework/component-runtime-definitions";
import { SharedMap, ISharedMap, IDirectoryValueChanged } from "@fluidframework/map";

import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom";

import { FluidContext, Widen } from "./useFluidMap";

const rootMapKey = "root-map-key";

function generateUseFluidMap(map: ISharedMap) {
    return function <T>(key: string, initialValue: AsJsonable<T>)
        : [Widen<T>, React.Dispatch<React.SetStateAction<Widen<T>>>] {
        const currentValue: Widen<T> = (map.get(key) ?? initialValue) as unknown as Widen<T>;
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

        const setNewState: React.Dispatch<React.SetStateAction<Widen<T>>> = (value) => map.set(key, value);

        return [state, setNewState];
    }
}

function generateUseFluidReducer(map: ISharedMap) {
    return function <T, U>(key: string, reducer: React.Reducer<Widen<T>, U>, initialState: AsJsonable<T>)
    : [Widen<T>, React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>] {
        const currentState: Widen<T> = (map.get(key) ?? initialState) as unknown as Widen<T>;
        const [state, setState] = useState(currentState);
        const dispatch: React.Dispatch<React.ReducerAction<React.Reducer<Widen<T>, U>>>
            = (action: any) => {
                const result = reducer(state, action);
                map.set(key, result);
            };

        useEffect(() => {
            const onValueChanged = (changed: IDirectoryValueChanged, local: boolean) => {
                if (changed.key === key) {
                    setState(map.get(key));
                }
            };
            map.on("valueChanged", onValueChanged);
            return () => {
                map.off("valueChanged", onValueChanged);
            };
        }, [state]);

        return [state, dispatch];
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
            const root = await rootP;
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
                        const reactContext = {
                            useMap: generateUseFluidMap(root),
                            useReducer: generateUseFluidReducer(root),
                        }
                        ReactDOM.render(
                            <>
                                <h2> Running with Fluid Context </h2>
                                <FluidContext.Provider value={reactContext}>
                                    {element}
                                </FluidContext.Provider>
                                <h2> Running <b>without</b> Fluid Context </h2>
                                {element}
                            </>,
                            div
                        );
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
