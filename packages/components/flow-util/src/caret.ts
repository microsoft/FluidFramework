// tslint:disable-next-line:no-relative-imports
import { Direction } from ".";

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
        if ("focus" in target) {
            (target as HTMLElement).focus();
        }

        return dispatchCaretEvent(CaretEventType.enter, target, direction, caretBounds);
    }

    export function caretLeave(target: Element, direction: Direction, caretBounds: ClientRect) {
        return dispatchCaretEvent(CaretEventType.leave, target, direction, caretBounds);
    }
}
