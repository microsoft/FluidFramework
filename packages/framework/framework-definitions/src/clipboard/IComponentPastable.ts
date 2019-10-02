/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponentContext } from "@microsoft/fluid-runtime-definitions";

declare module "@microsoft/fluid-component-core-interfaces" {
  export interface IComponent extends Readonly<Partial<IProvideComponentPastable>> {}
}

export interface IProvideComponentPastable {
  readonly IComponentPastable: IComponentPastable;
}

/**
 * Components may implement **IComponentPastable.getComponentUrlOnPaste** to provide an alternate component
 * identifier to be instantiated during the paste operation. This alternate component should be instantiated
 * on paste instead of the original component component identifier that was serialized on copy. In essence,
 * the first instantiated component (serialized component identifier) may act as a factory for the component
 * that will actually be instantiated.
 */
export interface IComponentPastable extends IProvideComponentPastable {
  getComponentUrlOnPaste(
    targetContainerContext: IComponentContext,
    queryParameters: string | undefined,
  ): Promise<string | undefined>;
}
