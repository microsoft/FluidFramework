/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dom, ICommand, KeyCode, randomId, Template, View } from "@fluid-example/flow-util-lib";
import { debug } from "../debug";
import * as style from "./index.css";

interface ISearchMenuProps {
    commands: ICommand[];
    onComplete: (command: ICommand) => void;
}

const template = new Template(
    {
        tag: "div", props: { className: style.searchMenu }, children: [
            { tag: "input", ref: "input", props: { type: "text", className: style.input, autocomplete: "off" } },
            { tag: "datalist", ref: "datalist" },
        ],
    });

const optionTemplate = new Template({ tag: "option" });

export class SearchMenuView extends View<ISearchMenuProps, ISearchMenuProps> {
    private state?: ISearchMenuProps;

    public show() {
        this.updateCommands();
        const root = this.root as HTMLElement;
        root.style.display = "inline-block";
        const input = template.get(root, "input") as HTMLElement;
        input.focus();
    }

    public hide() {
        const root = this.root as HTMLElement;
        root.blur();
        root.style.display = "none";
    }

    protected onAttach(props: Readonly<ISearchMenuProps>) {
        const root = template.clone();
        const input = template.get(root, "input") as HTMLInputElement;
        const list = template.get(root, "datalist");

        // Assign the datalist a random 'id' and <input> element to the datalist.
        input.setAttribute("list", list.id = randomId());

        this.onDom(input, "keydown", this.onKeyDown);

        this.state = props;

        return root;
    }

    protected onUpdate(props: Readonly<ISearchMenuProps>): void {
        this.state = props;

        this.updateCommands();
    }

    protected onDetach(): void {
        // Do nothing.
    }

    private updateCommands() {
        const list = template.get(this.root, "datalist");
        Dom.removeAllChildren(list);
        list.append(...this.state.commands
            .filter((command) => command.enabled())
            .map((command) => {
                const option = optionTemplate.clone() as HTMLOptionElement;
                option.value = command.name;

                return option;
            }));
    }

    private dismiss(e: KeyboardEvent) {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
    }

    private findCommand(text: string) {
        for (const command of this.state.commands) {
            if (command.name === text) {
                debug(`Search Menu: ${command.name}`);

                return command;
            }
        }

        return undefined;
    }

    private complete(e: KeyboardEvent, commit: boolean) {
        const input = template.get(this.root, "input") as HTMLInputElement;

        const command = commit
            ? this.findCommand(input.value)
            : undefined;

        this.dismiss(e);
        this.state.onComplete(command);
    }

    private readonly onKeyDown = (e: KeyboardEvent) => {
        switch (e.code) {
            case KeyCode.enter:
                this.complete(e, true);
                break;
            case KeyCode.escape:
                this.complete(e, false);
                break;
            default:
        }
    };
}
