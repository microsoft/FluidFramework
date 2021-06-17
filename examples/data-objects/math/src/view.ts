/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-empty-interface */

import {
    Caret,
    CaretEventType,
    Direction,
    Dom,
    ICaretEvent,
    KeyCode,
    Template,
    View,
} from "@fluid-example/flow-util-lib";
import { debug } from "./debug";
import * as style from "./index.css";

const template = new Template({
    tag: "div", props: { className: style.math }, children: [
        { tag: "div", ref: "cell", props: { className: style.cell } },
        { tag: "input", ref: "input", props: { className: style.input } },
    ],
});

interface IMathInit extends IMathProps { }
interface IMathProps { }

export class MathView extends View<IMathInit, IMathProps> {
    private input?: HTMLInputElement;
    private cell?: Element;

    protected onAttach(init: Readonly<IMathInit>): Element {
        const root = template.clone();
        this.input = template.get(root, "input") as HTMLInputElement;
        this.cell = template.get(root, "cell");
        this.input.value = "f(t) = sin(t)";

        this.onDom(this.input, "input", this.onInputChanged);
        this.onDom(this.input, "paste", this.onInputChanged);
        this.onDom(this.input, "keydown", this.onKeyDown);
        this.onDom(this.input, "keypress", this.onInputChanged);
        this.onDom(root, CaretEventType.enter, this.onCaretEnter as EventHandlerNonNull);
        this.onInputChanged();

        return root;
    }

    protected onUpdate(props: Readonly<IMathProps>): void {
        // Do nothing
    }

    protected onDetach(): void {
        // Do nothing
    }

    private readonly onInputChanged = () => {
        this.cell.textContent = this.input.value;
    };

    private caretLeave(e: KeyboardEvent, direction: Direction) {
        const caretBounds = Dom.getClientRect(this.cell.firstChild, this.input.selectionEnd) as DOMRect;
        if (Caret.caretLeave(this.input, direction, caretBounds)) {
            e.preventDefault();
            e.stopPropagation();
        }
    }

    private readonly onKeyDown = (e: KeyboardEvent) => {
        switch (e.code) {
            case KeyCode.arrowLeft:
                if (this.input.selectionEnd === 0) {
                    this.caretLeave(e, Direction.left);
                }
                break;
            case KeyCode.arrowRight:
                if (this.input.selectionEnd === this.input.value.length) {
                    this.caretLeave(e, Direction.right);
                }
                break;
            case KeyCode.arrowUp:
                this.caretLeave(e, Direction.up);
                break;
            case KeyCode.arrowDown:
                this.caretLeave(e, Direction.down);
                break;
            default:
                this.onInputChanged();
        }
    };

    private verticalCaretEnter(e: ICaretEvent) {
        const { left } = e.detail.caretBounds;
        const offset = Dom.findNodeOffset(this.cell.firstChild, left, -Infinity, +Infinity);
        this.input.setSelectionRange(offset, offset, "forward");
        e.preventDefault();
        e.stopPropagation();
    }

    private readonly onCaretEnter = (e: ICaretEvent) => {
        debug(`onCaretEnter(${JSON.stringify(e.detail)})`);

        const input = this.input;
        input.focus();

        switch (e.detail.direction) {
            case Direction.left:
                input.setSelectionRange(input.value.length, input.value.length, "backward");
                e.preventDefault();
                e.stopPropagation();
                break;
            case Direction.right:
                input.setSelectionRange(0, 0, "forward");
                e.preventDefault();
                e.stopPropagation();
                break;
            case Direction.up:
            case Direction.down:
                this.verticalCaretEnter(e);
                break;
            default:
        }
    };
}
