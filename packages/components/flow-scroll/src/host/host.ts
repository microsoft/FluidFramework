/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
// tslint:disable:align
import * as SearchMenu from "@chaincode/search-menu";
import { Editor, FlowDocument, Tag } from "@chaincode/webflow";
import { IComponent, ISharedComponent } from "@prague/container-definitions";
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

export class HostView extends View<IHostConfig> implements IComponent, SearchMenu.ISearchMenuHost {
    public static supportedInterfaces = [
        "ISearchMenuHost"];
    public viewport: HTMLElement;
    private state?: {
        activeSearchBox?: SearchMenu.ISearchBox;
        previouslyFocused?: HTMLOrSVGElement;
    };

    public query(id: string): any {
        return HostView.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return HostView.supportedInterfaces;
    }

    public onComplete = () => {
        this.state.previouslyFocused.focus();
        this.state.activeSearchBox.dismiss();
        this.state.activeSearchBox = undefined;
    }

    public showSearchMenu(commands: MergeTree.TST<SearchMenu.ISearchMenuCommand>, foldCase: boolean,
        showAllInitially: boolean, cmdParser?: (searchString: string, cmd?: SearchMenu.ISearchMenuCommand) => void): boolean {
        this.hostSearchMenu(commands, this.viewport, foldCase, this.onComplete, cmdParser);
        if (showAllInitially) {
            this.state.activeSearchBox.showAllItems();
        }
        return true;
    }

    public cancelSearchMenu() {
        this.onComplete();
    }

    protected onAttach(init: Readonly<IHostConfig>) {
        this.viewport = template.clone() as HTMLElement;
        const slot = template.get(this.viewport, "slot") as HTMLElement;

        const { doc } = init;

        // tslint:disable-next-line:no-unused-expression
        const editor = new Editor(doc, slot, this);

        const hasSelection = () => {
            const { start, end } = editor.selection;
            return start < end;
        };

        const insertComponent = (type: string, componentOptions: object, style?: string, classList?: string[]) => {
            const position = editor.selection.end;
            const url = randomId();
            init.context.createComponent(url, type).then((componentRuntime) => componentRuntime.attach());
            init.doc.insertComponent(position, `/${url}`, componentOptions, style, classList);
        };

        const insertComponentFromCollection = (factory: IComponentCollection, componentOptions: object, style?: string, classList?: string[]) => {
            const position = editor.selection.end;
            const instance = factory.create(componentOptions) as ISharedComponent;
            init.doc.insertComponent(position, `/${instance.url}`, componentOptions, style, classList);
        };

        const insertTags = (tags: Tag[]) => {
            const selection = editor.selection;
            init.doc.insertTags(tags, selection.start, selection.end);
        };

        const setFormat = (tag: Tag) => {
            const { end } = editor.selection;

            // Note that calling 'setFormat(..)' with the position of a paragraph marker will change the block
            // format of that marker.  This looks unnatural to the user, since the caret is still at the end of
            // the text on the previous line, hence the '- 1'.
            init.doc.setFormat(end - 1, tag);
        };

        const toggleSelection = (className: string) => {
            const { start, end } = editor.selection;
            init.doc.toggleCssClass(start, end, className);
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

            { key: "math inline", enabled: () => true, exec: () => insertComponentFromCollection(init.math, { display: "inline"}) },
            { key: "math block", enabled: () => true, exec: () => insertComponentFromCollection(init.math, { display: "block"}) },
            { key: "morton", enabled: () => true, exec: () => insertComponentFromCollection(init.videos, {}, "display:block;width:61%;--aspect-ratio:calc(16/9)") },
            { key: "image", enabled: () => true, exec: () => insertComponentFromCollection(init.images, {}, "display:inline-block;float:left;resize:both;overflow:hidden") },
            { key: "ivy", enabled: () => true, exec: () => insertComponent("@chaincode/charts", {}, "display:block;width:61%;resize:both;overflow:hidden") },
            { key: "table", enabled: () => true, exec: () => insertComponent("@chaincode/table-view", {}) },
            { key: "chart", enabled: () => true, exec: () => insertComponent("@chaincode/chart-view", {}) },
        ];
        const baseSearchCommands = new MergeTree.TST<IFlowCommand>();
        for (const command of commands) {
            baseSearchCommands.put(command.key, command);
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.code === KeyCode.keyM) {
                // Because the search menu is not yet attached to the DOM at the time this event is propagating,
                // we should consume the event on the search menu's behalf.
                e.preventDefault();
                this.hostSearchMenu(baseSearchCommands, this.viewport, false, this.onComplete);
            }
        };

        this.onDom(this.viewport, "keydown", onKeyDown);

        this.state = {  };

        return this.viewport;
    }

    protected hostSearchMenu(commands: MergeTree.TST<SearchMenu.ISearchMenuCommand>,
        containerElm: HTMLElement, foldCase = false, onComplete?: () => void,
        cmdParser?: (searchString: string, cmd?: SearchMenu.ISearchMenuCommand) => void) {
        this.state.previouslyFocused = document.activeElement as unknown as HTMLOrSVGElement;
        this.state.activeSearchBox = SearchMenu.searchBoxCreate(this, containerElm,
            commands, foldCase, cmdParser);
        this.state.activeSearchBox.setOnExec(onComplete);
        this.state.activeSearchBox.focus();
    }

    protected onUpdate(): void {
        // do nothing;
    }

    protected onDetach(): void {
        // tslint:disable-next-line:no-this-assignment
        this.state = undefined;
    }

}
