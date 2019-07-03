/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as SearchMenu from "@chaincode/search-menu";
import { Editor, FlowDocument, Tag } from "@chaincode/webflow";
import { ISharedComponent } from "@prague/container-definitions";
import { KeyCode, randomId, Scheduler, Template, View } from "@prague/flow-util";
import * as MergeTree from "@prague/merge-tree";
import { IComponentCollection, IComponentContext } from "@prague/runtime-definitions";
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

interface IFlowCommand extends SearchMenu.ISearchMenuCommand<HostView> {
}
const template = new Template(
    {
        tag: "div", props: { className: styles.host }, children: [
            {
                tag: "div", ref: "viewport", props: { className: styles.viewport }, children: [
                    {
                        tag: "div", props: { className: styles.padding }, children: [
                            { tag: "div", ref: "slot", props: { className: styles.slot } },
                        ],
                    },
                ],
            },
        ],
    });

export class HostView extends View<IHostConfig> {
    private state?: {
        activeSearchBox?: SearchMenu.ISearchBox;
        previouslyFocused?: HTMLOrSVGElement;
    };

    protected onAttach(init: Readonly<IHostConfig>) {
        const root = template.clone() as HTMLElement;
        const slot = template.get(root, "slot") as HTMLElement;

        const { doc } = init;

        // tslint:disable-next-line:no-unused-expression
        const editor = new Editor(doc, slot);

        const hasSelection = () => {
            const { start, end } = editor.selection;
            return start < end;
        };

        const insertComponent = (type: string, style?: string, classList?: string[]) => {
            const position = editor.selection.end;
            const url = randomId();
            init.context.createComponent(url, type).then((componentRuntime) => componentRuntime.attach());
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

        const onComplete = () => {
            this.state.previouslyFocused.focus();
            this.state.activeSearchBox.dismiss();
            this.state.activeSearchBox = undefined;
        };

        const commands: IFlowCommand[] = [
            { key: "blockquote", enabled: () => true, exec: () => { setFormat(Tag.blockquote); } },
            { key: "bold", enabled: hasSelection, exec: () => toggleSelection(styles.bold) },
            { key: "h1", enabled: () => true, exec: () => { setFormat(Tag.h1); } },
            { key: "h2", enabled: () => true, exec: () => { setFormat(Tag.h2); } },
            { key: "h3", enabled: () => true, exec: () => { setFormat(Tag.h3); } },
            { key: "h4", enabled: () => true, exec: () => { setFormat(Tag.h4); } },
            { key: "h5", enabled: () => true, exec: () => { setFormat(Tag.h5); } },
            { key: "h6", enabled: () => true, exec: () => { setFormat(Tag.h6); } },
            { key: "ol", enabled: () => true, exec: () => { insertTags([Tag.ol, Tag.li]); } },
            { key: "p", enabled: () => true, exec: () => { setFormat(Tag.p); } },
            { key: "ul", enabled: () => true, exec: () => { insertTags([Tag.ul, Tag.li]); } },

            { key: "math", enabled: () => true, exec: () => insertComponentFromCollection(init.math) },
            { key: "morton", enabled: () => true, exec: () => insertComponentFromCollection(init.videos, "display:block;width:61%;--aspect-ratio:calc(16/9)") },
            { key: "image", enabled: () => true, exec: () => insertComponentFromCollection(init.images, "display:inline-block;float:left;resize:both;overflow:hidden") },
            { key: "ivy", enabled: () => true, exec: () => insertComponent("@chaincode/charts", "display:block;width:61%;resize:both;overflow:hidden") },
            { key: "table", enabled: () => true, exec: () => insertComponent("@chaincode/table-view") },
            { key: "chart", enabled: () => true, exec: () => insertComponent("@chaincode/chart-view") },
        ];
        const baseSearchCommands = new MergeTree.TST<IFlowCommand>();
        for (const command of commands) {
            baseSearchCommands.put(command.key, command);
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === KeyCode.keyM) {
                this.state.previouslyFocused = document.activeElement as unknown as HTMLOrSVGElement;
                this.state.activeSearchBox = SearchMenu.searchBoxCreate(this, root,
                    baseSearchCommands, false, onComplete);
                this.state.activeSearchBox.setOnExec(onComplete);
                this.state.activeSearchBox.focus();
            }
        };

        this.onDom(root, "keydown", onKeyDown);

        this.state = {};

        return root;
    }

    protected onUpdate(): void {
        // do nothing;
    }

    protected onDetach(): void {
        // tslint:disable-next-line:no-this-assignment
        this.state = undefined;
    }

}
