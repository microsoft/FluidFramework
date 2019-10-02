/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
const fluidIdName = "data-fluid-id";
/*!
 * This file contains base functions for component developers that want to provide clipboard
 functionality for their components.
 *
 * ComponentClipboardHelper method shouldHandleClipboardEvent indicates if a component is the
 * owner of the selection. For this helper to work, all components need to have called
 * ComponentClipboardHelper.setComponentBoundaryAttributes pior to anybody calling this helper.
 * setComponentBoundaryAttributes accepts two parameters, the HTMLElement that is the outermost
 * element for the component and the fluid-id that identifies this component.
 */

/**
 * This function tells whether or not a component should be the starting point of a calls for data
 * that will be fed to the system clipboard.
 * @param event - The clipboard event received by a given component at its boundary.
 * @param componentFluidId - The fluid id of the component that wants to know if it is the
 * responsible for handling the clipboard operation.
 */
export function shouldHandleClipboardEvent(event: ClipboardEvent, componentFluidId: string): boolean {
  const selection = window.getSelection();
  if (selection !== null) {
    const commonAncestor = getSelectionCommonAncestorComponentDOMNode();
    if (
      commonAncestor &&
      commonAncestor.nodeType === Node.ELEMENT_NODE &&
      (commonAncestor as HTMLElement).getAttribute(fluidIdName) === componentFluidId &&
      (event.currentTarget as HTMLElement).closest("[data-fluid-id]") === commonAncestor
    ) {
      return true;
    }
  }
  return false;
}

/**
 * This function returns the common ancestor component of the current browser selection if there is one.
 * Otherwise it returns null.
 */
function getSelectionCommonAncestorComponentDOMNode(): Node | null {
  let commonAncestor: Node | null = window.getSelection()!.getRangeAt(0).commonAncestorContainer;
  // In case of text selection only the common ancestor will be a text node so we need to get it's
  // parent before we proceed.
  commonAncestor = commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentNode : commonAncestor;

  if (!commonAncestor) { return null; }

  do {
    if ((commonAncestor as HTMLElement).hasAttribute(fluidIdName)) {
      break;
    } else {
      commonAncestor = commonAncestor.parentNode;
    }
  } while (commonAncestor && commonAncestor !== document.body);

  return commonAncestor;
}

/**
 * Use this function to register all the attributes necessary for the clipboard events to work properly
 * at a component's boundary.
 * @param componentBoundary - The boundary of the component. Usually it will be the hosting component DIV.
 * @param componentFluidId - The id of the fluid component that is registering itself as a copyable component.
 */
export function setComponentBoundaryAttributes(componentBoundary: HTMLElement, componentFluidId: string) {
  componentBoundary.setAttribute(fluidIdName, componentFluidId);
}

export function getComponentBoundaryAttributes(componentBoundary: HTMLElement): string | null {
  return componentBoundary.getAttribute(fluidIdName);
}
