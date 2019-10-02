/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IComponentContext } from '@microsoft/fluid-runtime-definitions';

declare module '@microsoft/fluid-component-core-interfaces' {
  export interface IComponent extends Readonly<Partial<IProvideComponentPastable>> {}
}

export interface IProvideComponentPastable {
  readonly IComponentPastable: IComponentPastable;
}

/**
 * Interface that allows a hosting component to notify a pasted component it is being pasted
 */
export interface IComponentPastable extends IProvideComponentPastable {
  getComponentUrlOnPaste(
    targetContainerContext: IComponentContext,
    queryParameters: string | undefined
  ): Promise<string | undefined>;
}
