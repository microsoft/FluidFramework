/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommand, KeyCode, Scheduler, Template, View } from "@prague/flow-util";
import { IComponentContext } from "@prague/runtime-definitions";
import { FlowDocument } from "../../document";
import { debug } from "../debug";
import { SearchMenuView } from "../searchmenu";
import { Viewport } from "../viewport";
import * as styles from "./index.css";

// tslint:disable-next-line:no-empty-interface
interface IHostConfig {
    context: IComponentContext;
    scheduler: Scheduler;
    doc: FlowDocument;
}

const template = new Template(
    { tag: "div", props: { className: styles.host }, children: [
        { tag: "div", ref: "viewport", props: { type: "text", className: styles.viewport }},
        { tag: "div", ref: "search", props: { type: "text", className: styles.search }},
    ]});

export class HostView extends View<IHostConfig> {
    private state?: {
        viewport: Viewport;
        searchMenu: SearchMenuView;
        previouslyFocused?: HTMLOrSVGElement;
    };

    protected onAttach(init: Readonly<IHostConfig>) {
        const root = template.clone();

        const viewport = new Viewport();
        viewport.attach(template.get(root, "viewport"), { scheduler: init.scheduler, doc: init.doc });

        const searchMenu = new SearchMenuView();

        const hasSelection = () => {
            const editor = viewport.editor;
            if (editor === undefined) {
                return false;
            }

            const { start, end } = editor.selection;

            return start < end;
        };

        const insertTags = (tags: string[]) => {
            const selection = viewport.editor.selection;
            init.doc.insertTags(tags, selection.start, selection.end);
        };

        const toggleSelection = (className: string) => {
            const { start, end } = viewport.editor.selection;
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

        this.state = { viewport, searchMenu };

        return root;
    }

    protected onUpdate(): void {
        // do nothing;
    }

    protected onDetach(): void {
        // tslint:disable-next-line:no-this-assignment
        const { state } = this;
        state.viewport.detach();
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
