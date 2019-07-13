/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 import { IContainerContext, IRuntime, IRuntimeFactory, IRequest } from "@prague/container-definitions";
import { IComponentContext, IComponentRuntime, IComponentFactory } from "@prague/runtime-definitions";
import { DistributedSetValueType, CounterValueType, SharedMap } from "@prague/map";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { ComponentRuntime } from "@prague/component-runtime";
import { StockContainerRuntimeFactory } from "@prague/aqueduct";

import { Clicker } from "./main";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const chaincodeName = pkg.name as string;

export class ClickerFactoryComponent implements IComponentFactory, IRuntimeFactory {
  public static supportedInterfaces = ["IComponentFactory", "IRuntimeFactory"];

  public query(id: string): any {
    return ClickerFactoryComponent.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
  }

  public list(): string[] {
    return ClickerFactoryComponent.supportedInterfaces;
  }

  /**
   * This is where we do component setup.
   */
  public async instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
    // Register default map value types (Register the DDS we care about)
    // We need to register the Map and the Counter so we can create a root and a counter on that root
    const mapValueTypes = [
      new DistributedSetValueType(),
      new CounterValueType(),
    ];

    const dataTypes = new Map<string, ISharedObjectExtension>();
    const mapExtension = SharedMap.getFactory(mapValueTypes);
    dataTypes.set(mapExtension.type, mapExtension);

    // Create a new runtime for our component
    const runtime = await ComponentRuntime.load(context, dataTypes);

    // Create a new instance of our component
    const counterNewP = Component.load(runtime, context);

    // Add a handler for the request() on our runtime to send it to our component
    // This will define how requests to the runtime object we just created gets handled
    // Here we want to simply defer those requests to our component
    runtime.registerRequestHandler(async (request: IRequest) => {
      const counter = await counterNewP;
      return counter.request(request);
    });

    return runtime;
  }
  /**
  * This will get called by the Container as part of setup
  * We provide all the components we will care about as a registry.
  */
  public async instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return StockContainerRuntimeFactory.instantiateRuntime(context, chaincodeName, new Map([
      [chaincodeName, Promise.resolve(this)],
    ]));
  }
}

export const fluidExport = new ClickerFactoryComponent();

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return fluidExport.instantiateRuntime(context);
}

// Included for back compat - can remove in 0.7 once fluidExport is default
export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  return fluidExport.instantiateComponent(context);
}
