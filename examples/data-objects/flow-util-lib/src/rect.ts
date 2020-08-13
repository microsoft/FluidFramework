/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export type IRect = Readonly<Pick<ClientRect | DOMRect, "left" | "top" | "right" | "bottom">>;

export namespace Rect {
    export const empty: IRect = Object.freeze({ left: +Infinity, top: +Infinity, right: -Infinity, bottom: -Infinity });
}
