/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * IComponentFocusable interface specifies patterns to manage focus between components and their hosts.
 * This allows each component to decide how it implements focus and allows the host to configure what happens when
 * a component gives the focus back to the host.
 *
 * The main flow is: After component is loaded, the host can pass an implementation
 * of IComponentFocusable to allow the nested component to call giveFocus on the host when it wishes to
 * return back focus to the host.
 * If the host wants to give focus to a nested component, it notifies the nested component through giveFocus.
 * The implementation of how the nested component handles that is up to the component itself.
 * A component's focus state can be found through isComponentFocused. If a component has nested components
 * that are currently focused then the parent component is considered focused. The component itself is responsible
 * for maintaining its correct focus state
 *
 * Disclaimer: These interfaces are experimental and are subject to change.
 */

  declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentFocusable>> {}
  }

  export interface IProvideComponentFocusable {
    readonly ComponentFocusable: IComponentFocusable;
  }

  /**
   * Indicates where focus is respective to the component before attempting to move focus.
   */
  export enum FocusDirection {
    before,
    after
  }

  /**
   * ComponentFocusable is the contract for a component that can handle focus passes into
   * and out of the component.
   */
  export interface IComponentFocusable extends IProvideComponentFocusable {
    /**
     * Notifies Component that it should get focus
     * @returns true if the component successfully focuses its view
     * @param focusDirection optional additional information passed to component
     * to decide where focus should be placed in the component
     */
    giveFocus: (focusDirection?: FocusDirection) => boolean;

    /**
     * Allows us to interrogate the component to know if it currently has focus.
     * @returns true if the component or a any of its nested components has focus
     */
    isComponentFocused: () => boolean;

     /**
     *  host component's ComponentFocusable to allow the nested component to call giveFocus on the host
     *  when it wishes to return focus
     */
    setHostComponentFocusable?: (hostComponent: IComponentFocusable) => void;
  }
