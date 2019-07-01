/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Editor, FlowDocument, Tag } from "@chaincode/webflow";
import { ISharedComponent } from "@prague/container-definitions";
import { ICommand, KeyCode, randomId, Scheduler, Template, View } from "@prague/flow-util";
import { IComponentCollection, IComponentContext } from "@prague/runtime-definitions";
import { debug } from "./debug";
import * as styles from "./index.css";
import { SearchMenuView } from "./searchmenu";

// tslint:disable-next-line:no-empty-interface
interface IHostConfig {
    context: IComponentContext;
    scheduler: Scheduler;
    doc: FlowDocument;
    math: IComponentCollection;
    videos: IComponentCollection;
    images: IComponentCollection;
}

const template = new Template(
    { tag: "div", props: { className: styles.host }, children: [
        { tag: "div", ref: "viewport", props: { className: styles.viewport }, children: [
            { tag: "div", props: { className: styles.padding }, children: [
                { tag: "div", ref: "slot", props: { className: styles.slot } },
            ]},
        ]},
        { tag: "div", ref: "search", props: { className: styles.search }},
    ]});

export class HostView extends View<IHostConfig> {
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

        const insertComponent = (type: string, style?: string, classList?: string[]) => {
            const position = editor.selection.end;
            const url = randomId();
            init.context.createAndAttachComponent(url, type);
            init.doc.insertComponent(position, `/${url}`, style, classList);
        };

        const insertComponentFromCollection = (factory: IComponentCollection, style?: string, classList?: string[]) => {
            const position = editor.selection.end;
            const instance = factory.create() as ISharedComponent;
            init.doc.insertComponent(position, `/${instance.url}`, style, classList);
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

                { name: "math", enabled: () => true, exec: () => insertComponentFromCollection(init.math) },
                { name: "morton", enabled: () => true, exec: () => insertComponentFromCollection(init.videos, "display:block;width:61%;--aspect-ratio:calc(16/9)") },
                { name: "image", enabled: () => true, exec: () => insertComponentFromCollection(init.images, "display:inline-block;float:left;resize:both;overflow:hidden") },
                { name: "ivy", enabled: () => true, exec: () => insertComponent("@chaincode/charts", "display:block;width:61%;resize:both;overflow:hidden") },
                { name: "table", enabled: () => true, exec: () => insertComponent("@chaincode/table-view") },
                { name: "chart", enabled: () => true, exec: () => insertComponent("@chaincode/chart-view") },
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
