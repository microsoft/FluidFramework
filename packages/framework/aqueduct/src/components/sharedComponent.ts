import { ISharedComponent } from "@prague/container-definitions";
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

  private initializeP: Promise<void>;

  protected constructor(
    protected runtime: IComponentRuntime,
    protected context: IComponentContext,
    supportedInterfaces?: string[],
  ) {
    super();

    // concat supported interfaces
    if (supportedInterfaces) {
      this.supportedInterfaces = [...supportedInterfaces, ...this.supportedInterfaces];
    }

    this.url = context.id;
  }

  // start ISharedComponent

  /**
   * Returns this object if interface supported
   */
  public query(id: string): any {
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
   * Called the first time the root component is initialized
   */
  protected async created(): Promise<void> { }

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

  private async initializeInternal(): Promise<void> {
    // allow the inheriting class to override creation based on the lifetime
    if (this.runtime.existing) {
      await this.existing();
    } else {
      await this.created();
    }

    await this.opened();

    return;
  }
}
