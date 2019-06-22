/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { FlowDocument } from "@chaincode/flow-document";
import { ISharedComponent } from "@prague/container-definitions";
import { ICommand, KeyCode, randomId, Scheduler, Template, View } from "@prague/flow-util";
import { IComponentCollection, IComponentContext } from "@prague/runtime-definitions";
import { debug } from "../debug";
import { SearchMenuView } from "../searchmenu";
import { Viewport } from "../viewport";
import * as styles from "./index.css";

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

        const insertComponent = (type: string, style?: string, classList?: string[]) => {
            const position = viewport.editor.cursorPosition;
            const url = randomId();
            init.context.createAndAttachComponent(url, type);
            init.doc.insertComponent(position, `/${url}`, style, classList);
        };

        const insertComponentFromCollection = (factory: IComponentCollection, style?: string, classList?: string[]) => {
            const position = viewport.editor.cursorPosition;
            const instance = factory.create() as ISharedComponent;
            init.doc.insertComponent(position, `/${instance.url}`, style, classList);
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
                { name: "insert math", enabled: () => true, exec: () => insertComponentFromCollection(init.math) },
                { name: "insert morton", enabled: () => true, exec: () => insertComponentFromCollection(init.videos, "display:block;width:61%;--aspect-ratio:calc(16/9)") },
                { name: "insert image", enabled: () => true, exec: () => insertComponentFromCollection(init.images, "display:block;width:61%;--aspect-ratio:calc(16/9)") },
                { name: "insert ivy", enabled: () => true, exec: () => insertComponent("@chaincode/charts", "display:block;width:61%;resize:both;overflow:hidden") },
                { name: "insert table", enabled: () => true, exec: () => insertComponent("@chaincode/table-view") },
                { name: "insert chart", enabled: () => true, exec: () => insertComponent("@chaincode/chart-view") },
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
