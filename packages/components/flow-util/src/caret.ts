/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Direction } from ".";
import { getTabDirection } from "./direction";

export interface ICaretEvent extends CustomEvent {
    detail: {
        direction: Direction;
        caretBounds: ClientRect;
    };
}

export const enum CaretEventType {
    enter = "fluid:caretenter",
    leave = "fluid:caretleave",
}

// tslint:disable-next-line:no-namespace
export namespace Caret {
    function dispatchCaretEvent(type: CaretEventType, target: Element, direction: Direction, caretBounds: ClientRect) {
        return !(target.dispatchEvent(
            new CustomEvent(
                type, { detail: { direction, caretBounds }, bubbles: true, cancelable: true, composed: true },
            ) as ICaretEvent,
        ));
    }

    export function caretEnter(target: Element, direction: Direction, caretBounds: ClientRect) {
        const focusable = target.querySelectorAll(":enabled, [tabindex]");
        const focusTarget = (getTabDirection(direction) > 0
            ? focusable[0]
            : focusable[focusable.length - 1]) as Element | HTMLElement;

        if (focusTarget && "focus" in focusTarget) {
            focusTarget.focus();
        }

        return dispatchCaretEvent(CaretEventType.enter, target, direction, caretBounds);
    }

    export function caretLeave(target: Element, direction: Direction, caretBounds: ClientRect) {
        return dispatchCaretEvent(CaretEventType.leave, target, direction, caretBounds);
    }
}
