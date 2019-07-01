/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommand, KeyCode, Scheduler, Template, View } from "@prague/flow-util";
import { IComponentContext } from "@prague/runtime-definitions";
import { FlowDocument } from "../document";
import { Editor } from "../editor";
import { Tag } from "../util/tag";
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

        const insertTags = (tags: Tag[]) => {
            const selection = editor.selection;
            init.doc.insertTags(tags, selection.start, selection.end);
        };

        const setFormat = (tag: Tag) => {
            const selection = editor.selection;
            init.doc.setFormat(selection.end, tag);
        };

        const toggleSelection = (className: string) => {
            const { start, end } = editor.selection;
            init.doc.toggleCssClass(start, end, className);
        };

        searchMenu.attach(template.get(root, "search"), {
            commands: [
                { name: "blockquote", enabled: () => true, exec: () => { setFormat(Tag.blockquote); }},
                { name: "bold", enabled: hasSelection, exec: () => toggleSelection(styles.bold) },
                { name: "h1", enabled: () => true, exec: () => { setFormat(Tag.h1); }},
                { name: "h2", enabled: () => true, exec: () => { setFormat(Tag.h2); }},
                { name: "h3", enabled: () => true, exec: () => { setFormat(Tag.h3); }},
                { name: "h4", enabled: () => true, exec: () => { setFormat(Tag.h4); }},
                { name: "h5", enabled: () => true, exec: () => { setFormat(Tag.h5); }},
                { name: "h6", enabled: () => true, exec: () => { setFormat(Tag.h6); }},
                { name: "ol", enabled: () => true, exec: () => { insertTags([Tag.ol, Tag.li]); }},
                { name: "p",  enabled: () => true, exec: () => { setFormat(Tag.p); }},
                { name: "ul", enabled: () => true, exec: () => { insertTags([Tag.ul, Tag.li]); }},
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
