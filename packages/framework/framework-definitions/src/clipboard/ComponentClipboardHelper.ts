import { loadComponent } from '../appServices/ComponentLoader';
import { IComponentContext } from '@microsoft/fluid-runtime-definitions';
import { IComponent } from '@microsoft/fluid-component-core-interfaces';

const fluidIdName = 'data-fluid-id';
/**
 * @file
 * This file contains base functions for component developers that want to provide clipboard functionality for their components.
 *
 * ComponentClipboardHelper method shouldHandleClipboardEvent indicates if a component is the owner of the selection.
 * For this helper to work, all components need to have called ComponentClipboardHelper.setComponentBoundaryAttributes pior to anybody calling this helper.
 * A good time to call this might be in their render method. setComponentBoundaryAttributes accepts two parameters, the HTMLElement that is the outermost element for the
 * component and the fluid-id that identifies this component.
 */

/**
 * This function tells whether or not a component should be the starting point of a calls for data that will be fed to the system clipboard.
 * @param event The clipboard event received by a given component at its boundary.
 * @param componentFluidId The fluid id of the component that wants to know if it is the responsible for handling the clipboard operation.
 */
export function shouldHandleClipboardEvent(event: ClipboardEvent, componentFluidId: string): boolean {
  const selection = window.getSelection();
  if (selection !== null) {
    let commonAncestor = getSelectionCommonAncestorComponentDOMNode();
    if (
      commonAncestor &&
      commonAncestor.nodeType === Node.ELEMENT_NODE &&
      (<HTMLElement>commonAncestor).getAttribute(fluidIdName) === componentFluidId &&
      (<HTMLElement>event.currentTarget).closest('[data-fluid-id]') === commonAncestor
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
  // In case of text selection only the common ancestor will be a text node so we need to get it's parent before we proceed
  commonAncestor = commonAncestor.nodeType === Node.TEXT_NODE ? commonAncestor.parentNode : commonAncestor;

  if (!commonAncestor) return null;

  do {
    if ((<HTMLElement>commonAncestor).hasAttribute(fluidIdName)) {
      break;
    } else {
      commonAncestor = commonAncestor.parentNode;
    }
  } while (commonAncestor && commonAncestor !== document.body);

  return commonAncestor;
}

/**
 * Use this function to register all the attributes necessary for the clipboard events to work properly at a component's boundary.
 * @param componentBoundary The boundary of the component. Usually it will be the hosting component DIV.
 * @param componentFluidId The id of the fluid component that is registering itself as a copyable component.
 */
export function setComponentBoundaryAttributes(componentBoundary: HTMLElement, componentFluidId: string) {
  componentBoundary.setAttribute(fluidIdName, componentFluidId);
}

export function getComponentBoundaryAttributes(componentBoundary: HTMLElement): string | null {
  return componentBoundary.getAttribute(fluidIdName);
}

const convertComponentClipboardUrlToId = (sourceComponentURL: string): string | undefined => {
  const urlParts = sourceComponentURL.split('/');
  const lastUrlPart = decodeURIComponent(urlParts[urlParts.length - 1]);
  if (lastUrlPart.startsWith('?')) {
    let previousUrlPart = decodeURIComponent(urlParts[urlParts.length - 2]);
    return previousUrlPart + '/' + lastUrlPart;
  }
  return lastUrlPart;
};

const convertComponentClipboardUrlToQuery = (sourceComponentURL: string): string | undefined => {
  const urlParts = sourceComponentURL.split('?');
  if (urlParts.length > 1) {
    return decodeURIComponent(urlParts[1]);
  }
  return undefined;
};

export async function loadPastableComponent(
  sourceComponentURL: string,
  targetContext: IComponentContext
): Promise<IComponent | undefined> {
  const componentIdentifier = convertComponentClipboardUrlToId(sourceComponentURL);
  if (componentIdentifier) {
    // TODO: CLIPBOARD: We want to use source context here to enable cross container copy/paste.
    let componentUrl: string | undefined = componentIdentifier;
    const sourceComponent = await loadComponent(componentIdentifier, targetContext);

    if (sourceComponent && sourceComponent.IComponentPastable) {
      const decodedParameters = convertComponentClipboardUrlToQuery(sourceComponentURL);
      const urlOnPaste = await sourceComponent.IComponentPastable.getComponentUrlOnPaste(
        targetContext,
        decodedParameters
      );
      if (urlOnPaste !== undefined) {
        componentUrl = urlOnPaste;
      }
    }
    return componentUrl !== undefined ? Promise.resolve(loadComponent(componentUrl, targetContext)) : undefined;
  }

  return Promise.reject(
    'The process of loading the component at ' + sourceComponentURL + ' resulted on a invalid component for paste.'
  );
}
