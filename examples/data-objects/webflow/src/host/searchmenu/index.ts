/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Dom, ICommand, KeyCode, randomId } from "../../util";
import { debug } from "../debug";
import { View } from "./view";

// eslint-disable-next-line import/no-unassigned-import
import "./index.css";

interface ISearchMenuProps {
    commands: ICommand[];
    onComplete: (command: ICommand) => void;
}

export class SearchMenuView extends View<ISearchMenuProps, ISearchMenuProps> {
    private state?: ISearchMenuProps;
    private readonly inputElement = document.createElement("input");
    private readonly datalistElement = document.createElement("datalist");

    public show() {
        this.updateCommands();
        const root = this.root as HTMLElement;
        root.style.display = "inline-block";
        this.inputElement.focus();
    }

    public hide() {
        const root = this.root as HTMLElement;
        root.blur();
        root.style.display = "none";
    }

    protected onAttach(props: Readonly<ISearchMenuProps>) {
        const root = document.createElement("div");
        root.classList.add("searchMenu");

        this.inputElement.type = "text";
        this.inputElement.classList.add("input");
        this.inputElement.autocomplete = "off";
        // Assign the datalist a random 'id' and <input> element to the datalist.
        this.inputElement.setAttribute("list", this.datalistElement.id = randomId());
        this.onDom(this.inputElement, "keydown", this.onKeyDown);

        root.append(this.inputElement, this.datalistElement);

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
        Dom.removeAllChildren(this.datalistElement);
        this.datalistElement.append(...this.state.commands
            .filter((command) => command.enabled())
            .map((command) => {
                const option = document.createElement("option");
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
        const command = commit
            ? this.findCommand(this.inputElement.value)
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
