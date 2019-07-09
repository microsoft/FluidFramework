/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

 /**
  * If something is react viewable then render can simply return a JSX Element
  */
 export interface IComponentReactViewable {
     createViewElement(): JSX.Element;
 }
