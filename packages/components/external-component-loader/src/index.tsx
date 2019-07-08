/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Counter, CounterValueType, SharedMap, registerDefaultValueType } from "@prague/map";
import { IComponentHTMLViewable, IContainerContext, IRuntime, IComponent, IHTMLView, IRequest } from "@prague/container-definitions";
import { UrlRegistry } from "./UrlRegistry";
import * as uuid from "uuid";
import { SharedObjectSequence, SubSequence, SharedStringIntervalCollectionValueType, SharedIntervalCollectionValueType } from "@prague/sequence";
import { RootComponent, StockContainerRuntimeFactory} from "@prague/aqueduct";
import { IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import { ComponentRuntime, ServicePlatform } from "@prague/component-runtime";
import { IComponent as ILegacyComponent } from "@prague/runtime-definitions";

export class ExternalComponentLoader extends RootComponent implements IComponentHTMLViewable {
  private static readonly supportedInterfaces = ["IComponentHTMLViewable", "IComponentRouter"];

  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<ExternalComponentLoader> {
    const ucl = new ExternalComponentLoader(runtime, context, ExternalComponentLoader.supportedInterfaces);
    await ucl.initialize();

    return ucl;
  }

  protected async created() {
    await super.created();
    this.root.set("clicks", 0, CounterValueType.Name)
    const sequence = SharedObjectSequence.create<string>(this.runtime);
    sequence.attach();
    this.root.set("componentIds", sequence);
  }

  protected render() {
    const counter = this.root.get<Counter>("clicks");
    const counterSpan = document.getElementById("counterSpan"+ this.context.id);
    counterSpan.textContent = counter.value.toString();
  }

  public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {

    const myDiv = document.createElement("div");
    myDiv.id = this.context.id;
    element.appendChild(myDiv);

    const input = document.createElement("input")
    input.id = "input" + this.context.id;
    input.size = 128
    input.type = "text"
    input.value = "https://pragueauspkn-3873244262.azureedge.net/@chaincode/dynamic_loadingclicker@0.0.6"
    myDiv.append(input);

    const counterButton = document.createElement("button");
    counterButton.id = "counterButton"+ this.context.id;
    counterButton.textContent = "Add Component";
    counterButton.onclick = () => this.click();
    myDiv.appendChild(counterButton);

    const counterSpan = document.createElement("span");
    counterSpan.id = "counterSpan" + this.context.id;
    myDiv.appendChild(counterSpan);

    const sequence = await this.root.wait<SharedObjectSequence<string>>("componentIds");
    sequence.getItems(0, sequence.getLength()).forEach((id) => this.attachComponentView(id, element));

    sequence.on("sequenceDelta", (event, target) => {
      event.ranges.forEach((r) => {
        if (SubSequence.is(r.segment)) {
          r.segment.items.forEach((id) => this.attachComponentView(id, element));
        }
      });
      this.render();
    });
    this.root.on("op", () => {
      // this.render(maybeDiv);
      this.render();
    });

    return myDiv;
  }

  private click() {

    const input = document.getElementById("input" + this.context.id) as HTMLInputElement;

    if (input !== undefined) {

      const value = input.value;
      if (value !== undefined && value.length > 0) {

        const counter = this.root.get<Counter>("clicks");
        counter.increment(1);

        const seq = this.root.get<SharedObjectSequence<string>>("componentIds");

        this.context.createAndAttachComponent(uuid(), value)
          .then((cr) => {
            seq.insert(seq.getLength(), [cr.id]);
          })
      }
    }
  }

  private async attachComponentView(id: string, host: HTMLElement){

    const componentDiv = document.createElement("div");
    componentDiv.id = `${this.context.id}_${id}`;
    host.appendChild(componentDiv);

    const componentRuntime = await this.context.getComponentRuntime(id, true);
    const request = await componentRuntime.request({url: "/"});
    const legacyComponent: ILegacyComponent = request.value;
    if(legacyComponent.attach !== undefined){
      await legacyComponent.attach(new ServicePlatform([["div", Promise.resolve(componentDiv)]]));
    }else{
      const htmlViewableComponent: IComponentHTMLViewable = request.value;
      if (htmlViewableComponent.addView !== undefined){
        await htmlViewableComponent.addView(
          this,
          componentDiv);
      }
    }
  }
}

const pkg = require("../package.json");
const chaincodeName = pkg.name;

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return StockContainerRuntimeFactory.instantiateRuntime(
    context,
    chaincodeName,
    new UrlRegistry([chaincodeName, Promise.resolve({ instantiateComponent })]));
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {
  // Register default map value types (Register the DDS we care about)
  // We need to register the Map and the Counter so we can create a root and a counter on that root
  registerDefaultValueType(new CounterValueType());
  registerDefaultValueType(new SharedStringIntervalCollectionValueType());
  registerDefaultValueType(new SharedIntervalCollectionValueType());

  const dataTypes = new Map<string, ISharedObjectExtension>();
  const mapExtension = SharedMap.getFactory();
  dataTypes.set(mapExtension.type, mapExtension);
  const sequenceExtension = SharedObjectSequence.getFactory();
  dataTypes.set(sequenceExtension.type, sequenceExtension);

  // Create a new runtime for our component
  const runtime = await ComponentRuntime.load(context, dataTypes);

  // Create a new instance of our component
  const uclP = ExternalComponentLoader.load(runtime, context);

  // Add a handler for the request() on our runtime to send it to our component
  // This will define how requests to the runtime object we just created gets handled
  // Here we want to simply defer those requests to our component
  runtime.registerRequestHandler(async (request: IRequest) => {
    const ucl = await uclP;
    return ucl.request(request);
  });

  return runtime;
}
