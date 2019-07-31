/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 /**
  * If something is react viewable then render can simply return a JSX Element
  */
export interface IComponentReactViewable {
    readonly IComponentReactViewable: IComponentReactViewable;
    createJSXElement(props?: {}): JSX.Element;
}

declare module "@prague/component-core-interfaces" {
    export interface IComponent {
        readonly IComponentReactViewable?: IComponentReactViewable;
    }
}
