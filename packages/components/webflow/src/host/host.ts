/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommand, KeyCode, Scheduler, Template, View } from "@prague/flow-util";
import { IComponentContext } from "@prague/runtime-definitions";
import { FlowDocument } from "../document";
import { Editor } from "../editor";
import { debug } from "./debug";
import * as styles from "./index.css";
import { SearchMenuView } from "./searchmenu";

// tslint:disable-next-line:no-empty-interface
interface IHostConfig {
    context: IComponentContext;
    scheduler: Scheduler;
    doc: FlowDocument;
}

const template = new Template(
    { tag: "div", props: { className: styles.host }, children: [
        { tag: "div", ref: "viewport", props: { type: "text", className: styles.viewport }, children: [
            { tag: "div", ref: "slot", props: { className: styles.slot } },
        ]},
        { tag: "div", ref: "search", props: { type: "text", className: styles.search }},
    ]});

export class WebflowHost extends View<IHostConfig> {
    private state?: {
        searchMenu: SearchMenuView;
        previouslyFocused?: HTMLOrSVGElement;
    };

    protected onAttach(init: Readonly<IHostConfig>) {
        const root = template.clone();
        const slot = template.get(root, "slot") as HTMLElement;

        const { doc } = init;

        // tslint:disable-next-line:no-unused-expression
        const editor = new Editor(doc, slot);

        const searchMenu = new SearchMenuView();

        const hasSelection = () => {
            const { start, end } = editor.selection;
            return start < end;
        };

        const insertTags = (tags: string[]) => {
            const selection = editor.selection;
            init.doc.insertTags(tags, selection.start, selection.end);
        };

        const toggleSelection = (className: string) => {
            const { start, end } = editor.selection;
            init.doc.toggleCssClass(start, end, className);
        };

        searchMenu.attach(template.get(root, "search"), {
            commands: [
                { name: "bold", enabled: hasSelection, exec: () => toggleSelection(styles.bold) },
                { name: "insert list", enabled: () => true, exec: () => { insertTags(["OL", "LI"]); }},
            ],
            onComplete: this.onComplete,
         });

        this.onDom(root, "keydown", this.onKeyDown);

        this.state = { searchMenu };

        return root;
    }

    protected onUpdate(): void {
        // do nothing;
    }

    protected onDetach(): void {
        // tslint:disable-next-line:no-this-assignment
        const { state } = this;
        state.searchMenu.detach();
        this.state = undefined;
    }

    private readonly onKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.code === KeyCode.keyM) {
            this.state.previouslyFocused = document.activeElement as unknown as HTMLOrSVGElement;
            this.state.searchMenu.show();
        }
    }

    private readonly onComplete = (command?: ICommand) => {
        if (command) {
            debug(`Execute Command: ${command.name}`);
            command.exec();
        }

        this.state.previouslyFocused.focus();
    }
}
