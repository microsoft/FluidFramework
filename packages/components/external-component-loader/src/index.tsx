/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RootComponent, StockContainerRuntimeFactory} from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import {
  IComponent,
  IComponentHTMLViewable,
  IComponentLoadable,
  IContainerContext,
  IHTMLView,
  IPraguePackage,
  IRequest,
  IRuntime,
} from "@prague/container-definitions";
import { Counter, CounterValueType, SharedMap } from "@prague/map";
import { IComponentCollection, IComponentContext, IComponentRuntime } from "@prague/runtime-definitions";
import { SharedIntervalCollectionValueType, SharedObjectSequence, SubSequence } from "@prague/sequence";
import { ISharedObjectExtension } from "@prague/shared-object-common";
import * as uuid from "uuid";
import { UrlRegistry } from "./UrlRegistry";

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentLoader extends RootComponent implements IComponentHTMLViewable {

  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<ExternalComponentLoader> {
    const ucl = new ExternalComponentLoader(runtime, context, ExternalComponentLoader.supportedInterfaces);
    await ucl.initialize();

    return ucl;
  }
  private static readonly supportedInterfaces = ["IComponentHTMLViewable", "IComponentRouter"];

  public async addView(host: IComponent, element: HTMLElement): Promise<IHTMLView> {

    const myDiv = document.createElement("div");
    myDiv.id = this.context.id;
    element.appendChild(myDiv);

    const input = document.createElement("input");
    input.id = `input${this.context.id}`;
    input.size = 128;
    input.type = "text";
    input.value = `https://pragueauspkn-3873244262.azureedge.net/@chaincode/pinpoint-editor`;
    myDiv.append(input);

    const counterButton = document.createElement("button");
    counterButton.id = `counterButton"${this.context.id}`;
    counterButton.textContent = "Add Component";
    counterButton.onclick = () => this.click();
    myDiv.appendChild(counterButton);

    const counterSpan = document.createElement("span");
    counterSpan.id = `counterSpan"${this.context.id}`;
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
      this.render();
    });

    return myDiv;
  }

  protected async create() {
    await super.create();
    this.root.set("clicks", 0, CounterValueType.Name);
    const sequence = SharedObjectSequence.create<string>(this.runtime);
    sequence.register();
    this.root.set("componentIds", sequence);
  }

  protected render() {
    const counter = this.root.get<Counter>("clicks");
    const counterSpan = document.getElementById(`counterSpan"${this.context.id}`);
    counterSpan.textContent = counter.value.toString();
  }

  private async click() {

    const input = document.getElementById(`input${this.context.id}`) as HTMLInputElement;

    if (input !== undefined) {

      const value = input.value;
      if (value !== undefined && value.length > 0) {

        const counter = this.root.get<Counter>("clicks");
        const seq = this.root.get<SharedObjectSequence<string>>("componentIds");

        await this.context.createComponent(uuid(), value)
          .then(async (cr) => {
            if (cr.attach !== undefined) {
              cr.attach();
            }
            const request = await cr.request({url: "/"});

            let component = request.value as IComponentLoadable;
            const componentCollection = component.query<IComponentCollection>("IComponentCollection");
            if (componentCollection !== undefined) {
              component = componentCollection.create() as IComponentLoadable;
            }
            counter.increment(1);
            seq.insert(seq.getLength(), [component.url]);
          });
      }
    }
  }

  private async attachComponentView(url: string, host: HTMLElement) {

    const componentDiv = document.createElement("div");
    componentDiv.style.border = "1px solid lightgray";
    componentDiv.id = `${this.context.id}_${url}`;
    host.appendChild(componentDiv);

    const urlSplit = url.split("/");
    const componentRuntime = await this.context.getComponentRuntime(urlSplit.shift(), true);
    const request = await componentRuntime.request({url: `/${urlSplit.join("/")}`});
    const component = request.value as IComponent;

    const htmlViewableComponent: IComponentHTMLViewable = component.query("IComponentHTMLViewable");
    if (htmlViewableComponent !== undefined) {
      const view = await htmlViewableComponent.addView(
        this,
        componentDiv) as any;
      if (view !== undefined && view.render !== undefined) {
        view.render(componentDiv);
      }
    }
  }
}

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json") as IPraguePackage;

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return StockContainerRuntimeFactory.instantiateRuntime(
    context,
    pkg.name,
    new UrlRegistry(new Map([[pkg.name, Promise.resolve({instantiateComponent})]])));
}

export async function instantiateComponent(context: IComponentContext): Promise<IComponentRuntime> {

  const dataTypes = new Map<string, ISharedObjectExtension>();
  const mapExtension = SharedMap.getFactory(
    [new CounterValueType(),
    new SharedIntervalCollectionValueType()]);
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
