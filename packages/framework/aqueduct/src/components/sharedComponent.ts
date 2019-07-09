/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  IComponent,
  IResponse,
  ISharedComponent,
} from "@prague/container-definitions";
import { IComponentForge } from "@prague/framework-definitions";
import {
  IComponentContext,
  IComponentRuntime,
} from "@prague/runtime-definitions";

import { EventEmitter } from "events";

/**
 * This is as bare-bones base class that does basic setup and enables for extension on an initialize call.
 * You probably don't want to inherit from this component directly unless you are creating another base component class
 */
export abstract class SharedComponent extends EventEmitter implements ISharedComponent {

  public readonly url: string; // ISharedComponent

  private readonly supportedInterfaces = ["IComponent", "IComponentLoadable", "ISharedComponent"];

  private initializeP: Promise<void> | undefined;

  protected constructor(
    protected runtime: IComponentRuntime,
    protected context: IComponentContext,
    supportedInterfaces: string[],
  ) {
    super();

    // concat supported interfaces
    this.supportedInterfaces = [...supportedInterfaces, ...this.supportedInterfaces];
    this.url = context.id;
  }

  // start ISharedComponent

  /**
   * Returns this object if interface supported
   */
  public query<T>(id: string): any | undefined {

    // If they are requesting `IComponentForge` and it's not creation then return undefined.
    if (id === "IComponentForge" && this.runtime.existing) {
      return undefined;
    }

    return this.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
  }

  /**
   * returns a list of all supported objects
   */
  public list(): string[] {
    return this.supportedInterfaces;
  }

  // end ISharedComponent

  /**
   * Calls create, initialize, and attach on a new component. Optional props will be passed in if the
   * component being created supports IComponentForge
   *
   * @param id - unique component id for the new component
   * @param pkg - package name for the new component
   * @param props - optional props to be passed in if the component supports IComponentForge
   */
  protected async createAndAttachComponent(id: string, pkg: string, props?: any) {
    const runtime = await this.context.createComponent(id, pkg);
    const response = await runtime.request({url: "/"});
    const component = await this.isComponentResponse(response);

    const forge = component.query<IComponentForge>("IComponentForge");
    if (forge) {
      await forge.forge(props);
    }

    runtime.attach();
  }

  /**
   * Gets the component of a given id if any
   * @param id - component id
   */
  protected async getComponent(id: string): Promise<IComponent> {
    const response = await this.context.hostRuntime.request({ url: `/${id}` });
    return this.isComponentResponse(response);
  }

  /**
   * Called the first time the root component is initialized
   */
  protected async create(): Promise<void> { }

  /**
   * Called every time but the first time the component is initialized
   */
  protected async existing(): Promise<void> { }

  /**
   * Called every time the root component is initialized
   */
  protected async opened(): Promise<void> { }

  /**
   * Allow inheritors to plugin to an initialize flow
   * We guarantee that this part of the code will only happen once
   * TODO: add logging via debug
   */
  protected async initialize(): Promise<void> {
    if (!this.initializeP) {
      this.initializeP = this.initializeInternal();
    }

    await this.initializeP;

    return;
  }

  /**
   * Given a request response will return a component if a component was in the response.
   */
  private async isComponentResponse(response: IResponse): Promise<IComponent> {
    if (response.mimeType === "prague/component") {
      return response.value as IComponent;
    }

    return Promise.reject("response does not contain prague component");
  }

  private async initializeInternal(): Promise<void> {
    // allow the inheriting class to override creation based on the lifetime
    if (this.runtime.existing) {
      await this.existing();
    } else {
      await this.create();
    }

    await this.opened();

    return;
  }
}
