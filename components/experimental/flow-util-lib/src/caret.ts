/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { getTabDirection } from "./direction";
import { IRect } from "./rect";
import { Direction } from "./";

export type ICaretBounds = Pick<IRect, "left" | "top" | "bottom">;

export interface ICaretEvent extends CustomEvent {
    detail: {
        direction: Direction;
        caretBounds: ICaretBounds;
    };
}

export const enum CaretEventType {
    enter = "fluid:caretenter",
    leave = "fluid:caretleave",
}

export namespace Caret {
    // eslint-disable-next-line max-len
    function dispatchCaretEvent(type: CaretEventType, target: Element, direction: Direction, caretBounds: ICaretBounds) {
        return !(target.dispatchEvent(
            new CustomEvent(
                type, { detail: { direction, caretBounds }, bubbles: true, cancelable: true, composed: true },
            ) as ICaretEvent,
        ));
    }

    export function caretEnter(target: Element, direction: Direction, caretBounds: ICaretBounds) {
        const focusable = target.querySelectorAll(":enabled, [tabindex]");
        const focusTarget = (getTabDirection(direction) > 0
            ? focusable[0]
            : focusable[focusable.length - 1]) as Element | HTMLElement;

        if (focusTarget && "focus" in focusTarget) {
            focusTarget.focus();
            return dispatchCaretEvent(CaretEventType.enter, focusTarget, direction, caretBounds);
        } else {
            return dispatchCaretEvent(CaretEventType.enter, target, direction, caretBounds);
        }
    }

    export function caretLeave(target: Element, direction: Direction, caretBounds: ICaretBounds) {
        return dispatchCaretEvent(CaretEventType.leave, target, direction, caretBounds);
    }
}
