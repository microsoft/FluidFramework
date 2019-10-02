/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
declare module '@microsoft/fluid-component-core-interfaces' {
  export interface IComponent extends Readonly<Partial<IProvideComponentClipboardProvider>> {}
}

export interface IProvideComponentClipboardProvider {
  readonly IComponentClipboardProvider: IComponentClipboardProvider;
}

/*
 * Components should all register for the browser clipboard events on any of their HTML elements. If a component is the outermost
 * component in the selection, i.e., if it owns the selection, it should handle these events by constructing and setting the selected content
 * on the clipboard. All other components should ignore these events.
 *
 * If the selection includes nested components, the component that owns the selection should use the IComponentClipboardProvider interface
 * to acquire content to set on the clipboard from these nested components, and combine it with its own content. These nested components
 * should do the same with their own nested components. What content a component provides is entirely up to it.
 *
 * Components that can only be nested do not need to handle the browser clipboard events, they only need to implement the IComponentClipboardProvider. Only the outermost
 * component should handle these events and set the clipboard content.
 *
 * ComponentClipboardHelper method shouldHandleClipboardEvent indicates if a component is the owner of the selection.
 * For this helper to work, all components need to have called ComponentClipboardHelper.setComponentBoundaryAttributes pior to anybody calling this helper.
 * A good time to call this might be in their render method. setComponentBoundaryAttributes accepts two parameters, the HTMLElement that is the outermost element for the
 * component and the fluid-id that identifies this component.
 *
 */
export const fluidUrlAttributeName = 'fluid-url';

export interface IComponentClipboardProvider extends IProvideComponentClipboardProvider {
  // Return a new/unattached HTMLElement representation of the entire component instance to be serialized for the html clipboard slot.
  getComponentHtmlForClipboard(): HTMLElement | undefined;

  // Returns the string representation for the entire component instance to be serialized for the clipboard plain-text clipboard slot.
  // This should likely be consistent with the IStringData produced by getData.
  getComponentTextForClipboard(): string | undefined;
}
