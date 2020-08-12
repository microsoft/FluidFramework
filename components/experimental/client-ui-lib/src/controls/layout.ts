/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

declare module "@fluidframework/core-interfaces" {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    export interface IFluidObject extends Readonly<Partial<
        IProvideViewLayout
        & IProvideViewCursor
        & IProvideKeyHandlers>> {
    }
}

export const IViewLayout: keyof IProvideViewLayout = "IViewLayout";

export interface IProvideViewLayout {
    readonly IViewLayout: IViewLayout;
}

/**
 * Provide information about component preferences for layout.
 */
export interface IViewLayout extends IProvideViewLayout {
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
export enum CursorDirection {
    Left,
    Right,
    Up,
    Down,
    Airlift,
    Focus,
}

export const IViewCursor: keyof IProvideViewCursor = "IViewCursor";

export interface IProvideViewCursor {
    readonly IViewCursor: IViewCursor;
}

export interface IViewCursor extends IProvideViewCursor {
    enter(direction: CursorDirection): void;
    leave(direction: CursorDirection): void;
    // Returns true if cursor leaves the component
    fwd(): boolean;
    rev(): boolean;
}

export const IKeyHandlers: keyof IProvideKeyHandlers = "IKeyHandlers";

export interface IProvideKeyHandlers {
    readonly IKeyHandlers: IKeyHandlers;
}

// Used when another component will forward keyboard events to this component
export interface IKeyHandlers extends IProvideKeyHandlers {
    onKeypress(e: KeyboardEvent): void;
    onKeydown(e: KeyboardEvent): void;
}
