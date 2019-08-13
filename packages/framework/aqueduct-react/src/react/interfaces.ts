/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IProvideComponentReactViewable {
    readonly IComponentReactViewable: IComponentReactViewable;
}
 /**
  * If something is react viewable then render can simply return a JSX Element
  */
export interface IComponentReactViewable extends IProvideComponentReactViewable {
    createJSXElement(props?: {}): JSX.Element;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<IProvideComponentReactViewable>> {
    }
}
