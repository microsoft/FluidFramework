/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@prague/component-core-interfaces" {
    export interface IComponent extends Readonly<Partial<
    IProvideComponentLayout
    & IProvideComponentCursor
    & IProvideComponentKeyHandlers>> {
    }
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
    // returns true if cursor leaves the component
    fwd(): boolean;
    rev(): boolean;
}

export interface IProvideComponentKeyHandlers {
    readonly IComponentKeyHandlers: IComponentKeyHandlers;
}

// used when another component will forward keyboard events to this component
export interface IComponentKeyHandlers extends IProvideComponentKeyHandlers {
    onKeypress(e: KeyboardEvent): void;
    onKeydown(e: KeyboardEvent): void;
}
