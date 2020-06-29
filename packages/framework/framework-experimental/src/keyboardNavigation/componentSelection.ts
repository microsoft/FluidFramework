/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * IComponentSelection interface specifies contracts for managing selection between components and their hosts.
 * It supports two selection modes: IP selection and FullRange selection.
 * The main flow is: After component is loaded, the host can pass an implementation of IComponentSelection to
 * allow the nested component to call setSelection on the host when it wishes to return back selection to the host.
 * If the host wants to move selection to a nested component, it notifies the nested component through
 * setSelection. Similarly, clear selection can be used to remove selection from a nested component.
 * The implementation of how the nested component handles that is up to the component itself.
 * Disclaimer: These interface is experimental and is subject to change.
 */

  declare module "@fluidframework/component-core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<IProvideComponentSelection>> {}
  }

  export interface IProvideComponentSelection {
    readonly ComponentSelection: IComponentSelection;
  }

/**
 * Direction of selection movement. In case of ip selection indicates which direction the ip is coming from
 */
  export enum SelectionDirection {
    left,
    right,
    up,
    down
  }
  export enum SelectionMode {
    /**
     * ip selection mode
     */
    ip,
    /**
     * Select All mode if the component supports it, can be used for overtyping
     */
    fullRange
  }

  /**
   * Client screen coordinates for where the ip selection is coming from.
   */
  export interface SelectionCoordinates {
    x: number;
    y: number;
  }

  export interface SetSelectionParams {
    /**
     * ip selection or select all mode
     */
    mode: SelectionMode;
    /**
     * x y coordinates of selection before it moves to component
     */
    currentCoordinates?: SelectionCoordinates;
    /**
     * Direction to move selection (typically corresponding to arrow key used to move selection to component)
     */
    direction?: SelectionDirection;
  }

  export interface IComponentSelection extends IProvideComponentSelection {
    /**
     * Moves Selection to component.
     * @param details information about the current selection.
     * @returns true if selection is successfully set in the component
     */
    setSelection(details: SetSelectionParams): boolean;
    /**
     * Removes current selection from the component.
     */
    clearSelection?(): void;
    /**
     * Allows host to pass an IComponent that implements ComponentSelection to enable
     * nested to component to move set selection in the host
     */
    setHostComponentSelection?(hostComponent: IComponentSelection): void;
  }
