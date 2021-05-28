/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ui from "../ui";

export interface IKeyMsgPair {
    key: string;
    msg: string;
    showKey?: boolean;
}

export interface IStatus {
    add(key: string, msg: string);
    remove(key: string);
}

interface IOption {
    event: string;
    text: string;
    element: HTMLLIElement;
}

export class Status extends ui.Component implements IStatus {
    public info: IKeyMsgPair[] = [];
    private readonly commands: IOption[] = [];
    private readonly listElement: HTMLUListElement;
    private sliderElement: HTMLDivElement;

    constructor(element: HTMLDivElement) {
        super(element);
        this.element.classList.add("status-bar");
        this.element.style.backgroundColor = "#F1F1F1";

        // Insert options into toolbar
        this.listElement = document.createElement("ul");
    }

    public add(key: string, msg: string, showKey = false) {
        let i = this.findKV(key);
        if (i < 0) {
            i = this.info.length;
            this.info.push({ key, msg, showKey });
        } else {
            this.info[i].msg = msg;
            this.info[i].showKey = showKey;
        }
        this.renderBar();
    }

    public remove(key: string) {
        const i = this.findKV(key);
        if (i >= 0) {
            this.info.splice(i, 1);
        }
        this.renderBar();
    }

    public addOption(event: string, text: string, value?: boolean) {
        const element = document.createElement("li");
        this.listElement.appendChild(element);

        const input = document.createElement("input");
        input.type = "checkbox";
        input.onchange = (changeEvent) => {
            this.emit(event, input.checked);
        };
        input.defaultChecked = (value === undefined) ? false : value;

        const title = document.createTextNode(text);

        this.listElement.appendChild(input);
        this.listElement.appendChild(title);

        this.commands.push({ element, event, text });
    }

    /**
     * Adds a clickable button to the status bar does a form post on the action target
     */
    public addButton(text: string, action: string, post: boolean) {
        const element = document.createElement("li");
        this.listElement.appendChild(element);

        if (post) {
            const form = document.createElement("form");
            form.classList.add("inline-form");
            form.action = action;
            form.method = "post";
            form.target = "_blank";
            element.appendChild(form);

            const button = document.createElement("input");
            button.classList.add("btn", "btn-default", "btn-xs");
            button.type = "submit";
            button.value = text;
            form.appendChild(button);
        } else {
            const button = document.createElement("a");
            button.classList.add("btn", "btn-default", "btn-xs");
            button.href = action;
            button.target = "_blank";
            button.innerText = text;

            element.appendChild(button);
        }
    }

    public removeOption(event: string) {
        const index = this.commands.findIndex((value) => value.event === event);
        if (index !== -1) {
            const removed = this.commands.splice(index, 1);
            removed[0].element.remove();
        }
    }

    public addSlider(sliderDiv: HTMLDivElement) {
        this.sliderElement = sliderDiv;
        this.renderBar();
    }

    public removeSlider() {
        this.sliderElement = undefined;
        this.renderBar();
    }

    public renderBar() {
        let buf = "";
        let first = true;
        for (const kv of this.info) {
            buf += "<span>";
            if (!first) {
                if (kv.showKey) {
                    buf += ";  ";
                } else {
                    buf += " ";
                }
            }
            first = false;
            if (kv.showKey) {
                buf += `${kv.key}: ${kv.msg}`;
            } else {
                buf += `${kv.msg}`;
            }
            buf += "</span>";
        }

        this.element.innerHTML = buf;

        // Add options
        this.element.appendChild(this.listElement);
        if (this.sliderElement) {
            this.element.appendChild(this.sliderElement);
        }
    }

    public measure(size: ui.ISize): ui.ISize {
        return { width: size.width, height: 30 };
    }

    private findKV(key: string) {
        for (let i = 0, len = this.info.length; i < len; i++) {
            if (this.info[i].key === key) {
                return i;
            }
        }
        return -1;
    }
}
