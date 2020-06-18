/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ISharedComponentProps,
    PrimedComponent,
} from "@fluidframework/aqueduct";
import {
    IComponentLoadable,
    IComponent,
    IRequest,
} from "@fluidframework/component-core-interfaces";
import { IComponentHTMLView } from "@fluidframework/view-interfaces";
import {
    IComponentFactory,
    IComponentContext,
} from "@fluidframework/runtime-definitions";
import { ComponentRuntime } from "@fluidframework/component-runtime";
import { SharedDirectory } from "@fluidframework/map";

import React from "react";
import ReactDOM from "react-dom";

import {
    FluidContext,
    generateUseFluidState,
    generateUseFluidReducer,
} from "./FluidContext";

class InternalFluidReactComponent extends PrimedComponent implements IComponentHTMLView {
    private readonly element: JSX.Element;
    get IComponentHTMLView() { return this; }

    public constructor(props: InternalFluidReactComponentProps) {
        super(props);
        this.element = props.element;
    }

    public render(div: HTMLElement) {
        const reactContext = {
            useState: generateUseFluidState(this.root),
            useReducer: generateUseFluidReducer(this.root),
        };
        ReactDOM.render(
            <FluidContext.Provider value={reactContext}>
                {this.element}
            </FluidContext.Provider>,
            div);
    }
}

interface InternalFluidReactComponentProps extends ISharedComponentProps<never> {
    element: JSX.Element;
}

class InternalFluidReactComponentFactory implements IComponentFactory {
    public get IComponentFactory() { return this; }

    public constructor(public readonly type: string, private readonly element: JSX.Element) { }

    public createComponent?(context: IComponentContext): Promise<IComponent & IComponentLoadable> {
        return context.createComponentWithRealizationFn(this.type, this.instantiateComponent.bind(this));
    }

    public instantiateComponent(context: IComponentContext): void {
        const directoryFactory = SharedDirectory.getFactory();
        const runtime = ComponentRuntime.load(
            context,
            new Map([[directoryFactory.type, directoryFactory]]),
        );

        let instanceP: Promise<InternalFluidReactComponent>;
        // For new runtime, we need to force the component instance to be create
        // run the initialization.
        if (!runtime.existing) {
            // Create a new instance of our component up front
            instanceP = this.instantiateInstance(runtime, context);
        }

        runtime.registerRequestHandler(async (request: IRequest) => {
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            if (!instanceP) {
                // Create a new instance of our component on demand
                instanceP = this.instantiateInstance(runtime, context);
            }
            const instance = await instanceP;
            return instance.request(request);
        });
    }

    private async instantiateInstance(
        runtime: ComponentRuntime,
        context: IComponentContext,
    ) {
        // Create a new instance of our component
        const props = {
            element: this.element,
            runtime,
            context,
            providers: {} as any,
        };
        const instance = new InternalFluidReactComponent(props);
        await instance.initialize();
        return instance;
    }
}

export const createTinyFluidReactComponentFactory =
(componentName: string, element: JSX.Element): IComponentFactory => {
    return new InternalFluidReactComponentFactory(componentName, element);
};
