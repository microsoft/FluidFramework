/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
declare module "@microsoft/fluid-component-core-interfaces" {
  export interface IComponent extends Readonly<Partial<IProvideComponentClipboardProvider>> {}
}

export interface IProvideComponentClipboardProvider {
  readonly IComponentClipboardProvider: IComponentClipboardProvider;
}

/**
 * During copy, component hosts can use their “selection” or equivalent concept to identify any nested
 * components involved. If the selection includes nested components, the host component should use the
 * **IComponentClipboardProvider** interface on each of these nested component to acquire their contribution
 * to the copied content, and combine it with its own copied content. These nested components should do the
 * same with their own nested components. What content a component provides is entirely up to it.
 *
 * Nested components might need to contribute multiple formats of clipboard data to their host components
 * (e.g. plain-text, HTML).
 *
 * In addition, a nested component should specify their complete fluid url in the **fluidUrlAttributeName**
 * data- attribute of its containing HTML element to ensure that the proper component is instantiated on paste.
 *
 * Disclaimer: These interfaces are experimental and are subject to change.
 */

export const fluidUrlAttributeName = "fluid-url";

export interface IComponentClipboardProvider extends IProvideComponentClipboardProvider {
  // Return a new/unattached HTMLElement representation of the entire component instance to be
  // serialized for the html clipboard slot.
  getComponentHtmlForClipboard(): HTMLElement | undefined;

  // Returns the string representation for the entire component instance to be serialized for the
  // clipboard plain-text clipboard slot.
  getComponentTextForClipboard(): string | undefined;
}
