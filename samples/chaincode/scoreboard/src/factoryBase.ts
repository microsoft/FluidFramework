/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { StockContainerRuntimeFactory } from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import { IContainerContext, IRequest, IRuntime, IRuntimeFactory } from "@prague/container-definitions";
import { CounterValueType, SharedMap } from "@prague/map";
import { IComponentContext, IComponentFactory, IComponentRuntime } from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { IComponentRegistry } from "@prague/container-runtime";

/**
 * This is the function that will be called to load the component
 */
export type ComponentLoadFunction = (runtime: IComponentRuntime, context: IComponentContext) => Promise<any>;

/**
 * This base class simplifies the creation of a ComponentFactory. In its current form, unless a subclass overrides
 * instantiateComponent, the only distributed data structures available are SharedMap and Counter.
 *
 * For standalone components (i.e. components without any subcomponents), subclasses can simply call the base class
 * constructor. For components that load other components, subclasses must also call initializeRegistry and provide
 * a mapping of ComponentName to ComponentFactory class.
 *
 * TODO: Could subclasses provide a list of data structures they want in a simple way?
 */
export class FactoryBase implements IComponentFactory, IRuntimeFactory, IComponentRegistry {
  protected static supportedInterfaces = ["IComponentFactory", "IRuntimeFactory"];
  get supportedInterfaces() { return FactoryBase.supportedInterfaces; }
  set supportedInterfaces(val: string[]) { this.supportedInterfaces = val; }

  private registry: Map<string, Promise<IComponentFactory>>;
  private readonly componentName: string;
  private readonly loadFunction: ComponentLoadFunction;

  public constructor(componentName: string, loadFunction: ComponentLoadFunction) {
    this.componentName = componentName;
    this.loadFunction = loadFunction;
  }

  protected initializeRegistry(registry: Map<string, Promise<IComponentFactory>>){
    if (registry) {
      this.supportedInterfaces.concat("IComponentRegistry");
      this.registry = registry;
    }
  }

  public query(id: string): any {
    return FactoryBase.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
  }

  public list(): string[] {
    return FactoryBase.supportedInterfaces;
  }

  public async get(name: string): Promise<IComponentFactory> {
    return this.registry.get(name);
  }

  /**
 * This will get called by the Container as part of setup
 * We provide all the components we will care about as a registry.
 */
  public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return StockContainerRuntimeFactory.instantiateRuntime(context, this.componentName, new Map([
      [this.componentName, Promise.resolve(this)],
    ]));
  }

  public async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types (Register the DDS we care about)
    // We need to register the Map and the Counter so we can create a root and a counter on that root
    const mapValueTypes = [
      new CounterValueType(),
    ];

    const dataTypes = new Map<string, ISharedObjectExtension>();
    const mapExtension = SharedMap.getFactory(mapValueTypes);
    dataTypes.set(mapExtension.type, mapExtension);

    // Create a new runtime for our component
    const runtime = await ComponentRuntime.load(context, dataTypes);

    // Create a new instance of our component
    const componentInstance = this.loadFunction(runtime, context);

    // Add a handler for the request() on our runtime to send it to our component
    // This will define how requests to the runtime object we just created gets handled
    // Here we want to simply defer those requests to our component
    runtime.registerRequestHandler(async (request: IRequest) => {
      const counter = await componentInstance;
      return counter.request(request);
    });

    return runtime;
  }
}
