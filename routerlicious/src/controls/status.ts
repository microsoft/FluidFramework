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
    private commands: IOption[] = [];
    private listElement: HTMLUListElement;

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
        let i = this.findKV(key);
        if (i >= 0) {
            this.info.splice(i, 1);
        }
        this.renderBar();
    }

    public addOption(event: string, text: string) {
        const element = document.createElement("li");
        this.listElement.appendChild(element);

        const input = document.createElement("input");
        input.type = "checkbox";
        input.onchange = (changeEvent) => {
            this.emit(event, input.checked);
        };

        const title = document.createTextNode(text);

        this.listElement.appendChild(input);
        this.listElement.appendChild(title);

        this.commands.push({ element, event, text });
    }

    public removeOption(event: string) {
        const index = this.commands.findIndex((value) => value.event === event);
        if (index !== -1) {
            const removed = this.commands.splice(index, 1);
            removed[0].element.remove();
        }
    }

    public renderBar() {
        let buf = "";
        let first = true;
        for (let kv of this.info) {
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
            buf += "<\span>";
        }

        this.element.innerHTML = buf;

        // Add options
        this.element.appendChild(this.listElement);
    }

    public measure(size: ui.ISize): ui.ISize {
        return { width: size.width, height: 22 };
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
