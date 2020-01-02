/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@microsoft/fluid-component-core-interfaces" {
    /* eslint-disable @typescript-eslint/indent */
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IComponent extends Readonly<Partial<
        IProvideComponentLayout
        & IProvideComponentCursor
        & IProvideComponentKeyHandlers>> {
    }
    /* eslint-enable @typescript-eslint/indent */
}

export interface IProvideComponentLayout {
    readonly IComponentLayout: IComponentLayout;
}

/**
 * Provide information about component preferences for layout.
 */
export interface IComponentLayout extends IProvideComponentLayout {
    aspectRatio?: number;
    minimumWidth?: number;
    minimumHeight?: number;
    variableHeight?: boolean;
    requestedWidthPercentage?: number;
    canInline?: boolean;
    preferInline?: boolean;
    preferPersistentElement?: boolean;
}

/**
 * Direction from which the cursor has entered or left a component.
 */
export enum ComponentCursorDirection {
    Left,
    Right,
    Up,
    Down,
    Airlift,
    Focus,
}

export interface IProvideComponentCursor {
    readonly IComponentCursor: IComponentCursor;
}

export interface IComponentCursor extends IProvideComponentCursor {
    enter(direction: ComponentCursorDirection): void;
    leave(direction: ComponentCursorDirection): void;
    // Returns true if cursor leaves the component
    fwd(): boolean;
    rev(): boolean;
}

export interface IProvideComponentKeyHandlers {
    readonly IComponentKeyHandlers: IComponentKeyHandlers;
}

// Used when another component will forward keyboard events to this component
export interface IComponentKeyHandlers extends IProvideComponentKeyHandlers {
    onKeypress(e: KeyboardEvent): void;
    onKeydown(e: KeyboardEvent): void;
}
