/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { PrimedComponent, SimpleComponentInstantiationFactory, SimpleModuleInstantiationFactory } from "@prague/aqueduct";
import { IComponentHTMLVisual, IContainerContext, IRuntime } from "@prague/container-definitions";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
export declare const ClickerName: string;
/**
 * Basic Clicker example using new interfaces and stock component classes.
 */
export declare class Clicker extends PrimedComponent implements IComponentHTMLVisual {
    private static readonly supportedInterfaces;
    /**
     * Do setup work here
     */
    protected create(): Promise<void>;
    /**
     * Static load function that allows us to make async calls while creating our object.
     * This becomes the standard practice for creating components in the new world.
     * Using a static allows us to have async calls in class creation that you can't have in a constructor
     */
    static load(runtime: IComponentRuntime, context: IComponentContext): Promise<Clicker>;
    /**
     * Will return a new Clicker view
     */
    render(div: HTMLElement): HTMLElement;
}
export declare const ClickerInstantiationFactory: SimpleComponentInstantiationFactory;
export declare const fluidExport: SimpleModuleInstantiationFactory;
export declare function instantiateRuntime(context: IContainerContext): Promise<IRuntime>;
export declare function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime>;
//# sourceMappingURL=index.d.ts.map