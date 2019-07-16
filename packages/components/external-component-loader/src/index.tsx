/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { RootComponent, SimpleContainerRuntimeFactory } from "@prague/aqueduct";
import { ComponentRuntime } from "@prague/component-runtime";
import {
  IComponent,
  IComponentHTMLVisual,
  IComponentLoadable,
  IContainerContext,
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

export function clearSubtree(elm: HTMLElement) {
  const removeList: Node[] = [];
  for (const child of elm.childNodes) {
      if (!(child as HTMLElement).classList.contains("preserve")) {
          removeList.push(child);
      }
  }
  for (const node of removeList) {
      elm.removeChild(node);
  }
}

/**
 * Component that loads extneral components via their url
 */
export class ExternalComponentLoader extends RootComponent implements IComponentHTMLVisual {
  public static async load(runtime: IComponentRuntime, context: IComponentContext): Promise<ExternalComponentLoader> {
    const ucl = new ExternalComponentLoader(runtime, context, ExternalComponentLoader.supportedInterfaces);
    await ucl.initialize();

    return ucl;
  }

  private static readonly supportedInterfaces = ["IComponentHTMLVisual", "IComponentHTMLRender", "IComponentRouter"];
  public sequence: SharedObjectSequence<string>;
  private readonly urlToComponent = new Map<string, IComponent>();
  private savedElement: HTMLElement;

  public render(element: HTMLElement) {
    if (element !== this.savedElement) {
      this.savedElement = element;
    } else {
      clearSubtree(element);
    }
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

    const createCounterSpan = document.createElement("span");
    createCounterSpan.id = `counterSpan"${this.context.id}`;
    myDiv.appendChild(createCounterSpan);

    const counter = this.root.get<Counter>("clicks");
    const counterSpan = document.getElementById(`counterSpan"${this.context.id}`);
    counterSpan.textContent = counter.value.toString();
    this.sequence.getItems(0, this.sequence.getLength()).forEach((id) => {
      const componentDiv = document.createElement("div");
      componentDiv.style.border = "1px solid lightgray";
      componentDiv.id = `${this.context.id}_${id}`;
      element.appendChild(componentDiv);
      const component = this.urlToComponent.get(id);
      const componentVisual =
        component.query<IComponentHTMLVisual>("IComponentHTMLVisual");
      if (componentVisual) {
        componentVisual.render(componentDiv);
      }
    });
  }

  protected async create() {
    await super.create();
    this.root.set("clicks", 0, CounterValueType.Name);
    const sequence = SharedObjectSequence.create<string>(this.runtime);
    sequence.register();
    this.root.set("componentIds", sequence);
    await this.init();
  }

  protected async existing() {
    await super.existing();
    await this.init();
  }

  private localRender() {
    if (this.savedElement) {
      this.render(this.savedElement);
    }
  }

  private async init() {
    this.sequence = await this.root.wait<SharedObjectSequence<string>>("componentIds");
    this.root.on("op", () => {
      this.localRender();
    });
    this.sequence.on("sequenceDelta", (event, target) => {
      event.deltaArgs.deltaSegments.forEach((segment) => {
        if (SubSequence.is(segment.segment)) {
          segment.segment.items.forEach(async (url: string) => {
            const urlSplit = url.split("/");
            const componentRuntime = await this.context.getComponentRuntime(urlSplit.shift(), true);
            const request = await componentRuntime.request({ url: `/${urlSplit.join("/")}` });
            const component = request.value as IComponent;
            this.urlToComponent.set(url, component);
          });
        }
      });
      this.localRender();
    });
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
            const request = await cr.request({ url: "/" });

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
}
// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json") as IPraguePackage;

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
  return SimpleContainerRuntimeFactory.instantiateRuntime(
    context,
    pkg.name,
    new UrlRegistry(new Map([[pkg.name, Promise.resolve({ instantiateComponent })]])));
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
