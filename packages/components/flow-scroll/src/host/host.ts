/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as SearchMenu from "@chaincode/search-menu";

import { Editor, FlowDocument, htmlFormatter, Tag } from "@chaincode/webflow";
import { IComponentHTMLView, IComponentHTMLVisual, IComponentLoadable } from "@prague/component-core-interfaces";
import { KeyCode, randomId, Template } from "@prague/flow-util";
import { TST } from "@prague/merge-tree";
import { IComponentCollection, IComponentContext } from "@prague/runtime-definitions";
import * as styles from "./index.css";

const template = new Template(
    { tag: "div", props: { className: styles.host }, children: [
        { tag: "div", ref: "viewport", props: { className: styles.viewport }, children: [
            { tag: "div", props: { className: styles.padding }, children: [
                { tag: "p", ref: "slot", props: { className: styles.slot } },
            ]},
        ]},
    ]});

export class HostView implements IComponentHTMLView, SearchMenu.ISearchMenuHost {
    public get ISearchMenuHost() { return this; }
    public get IComponentHTMLRender() { return this; }
    public get IComponentHTMLView() { return this; }

    private activeSearchBox?: SearchMenu.ISearchBox;
    private previouslyFocused?: HTMLOrSVGElement;
    private viewport: HTMLElement;

    constructor(
        private readonly context: IComponentContext,
        private readonly docP: Promise<FlowDocument>,
        private readonly mathP: Promise<IComponentCollection>,
        private readonly videosP: Promise<IComponentCollection>,
        private readonly imagesP: Promise<IComponentCollection>,
        private readonly intelViewer: IComponentHTMLVisual,
    ) {}

    // #region IComponentHTMLView
    public remove(): void {
        if (this.viewport) {
            this.viewport.remove();
            this.viewport = undefined;
        }
    }

    public render(elm: HTMLElement): void {
        const flowDiv = document.createElement("div");
        const insightsDiv = document.createElement("div");
        elm.style.display = "flex";
        elm.style.height = "100%";
        flowDiv.style.flexGrow = "4";
        insightsDiv.style.flexGrow = "1";
        insightsDiv.style.minWidth = "25%";
        insightsDiv.style.maxWidth = "25%";
        insightsDiv.style.backgroundColor = "whitesmoke";
        insightsDiv.style.display = "none";
        elm.append(flowDiv, insightsDiv);

        this.viewport = template.clone() as HTMLElement;

        Promise.all([this.docP, this.mathP, this.videosP, this.imagesP]).then(([doc, math, videos, images]) => {
            const slot = template.get(this.viewport, "slot") as HTMLElement;
            const editor = new Editor(doc, slot, htmlFormatter, this);

            const hasSelection = () => {
                const { start, end } = editor.selection;
                return start < end;
            };

            const insertComponent = (type: string, componentOptions: object, style?: string, classList?: string[]) => {
                const position = editor.selection.end;
                const url = randomId();
                this.context.createComponent(url, type).then((componentRuntime) => componentRuntime.attach());
                doc.insertComponent(position, `/${url}`, componentOptions, style, classList);
            };

            const insertComponentFromCollection = (factory: IComponentCollection, componentOptions: object, style?: string, classList?: string[]) => {
                const position = editor.selection.end;
                const instance = factory.createCollectionItem(componentOptions) as IComponentLoadable;
                doc.insertComponent(position, `/${instance.url}`, componentOptions, style, classList);
            };

            const insertTags = (tags: Tag[]) => {
                const selection = editor.selection;
                doc.insertTags(tags, selection.start, selection.end);
            };

            const setFormat = (tag: Tag) => {
                const { end } = editor.selection;

                // Note that calling 'setFormat(..)' with the position of a paragraph marker will change the block
                // format of that marker.  This looks unnatural to the user, since the caret is still at the end of
                // the text on the previous line, hence the '- 1'.
                doc.setFormat(end - 1, tag);
            };

            const toggleSelection = (className: string) => {
                const { start, end } = editor.selection;
                doc.toggleCssClass(start, end, className);
            };

            const commands: Array<SearchMenu.ISearchMenuCommand<HostView>> = [
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

                { key: "math inline", enabled: () => true, exec: () => insertComponentFromCollection(math, { display: "inline"}) },
                { key: "math block", enabled: () => true, exec: () => insertComponentFromCollection(math, { display: "block"}) },
                { key: "morton", enabled: () => true, exec: () => insertComponentFromCollection(videos, {}, "display:block;width:61%;--aspect-ratio:calc(16/9)") },
                { key: "image", enabled: () => true, exec: () => insertComponentFromCollection(images, {}, "display:inline-block;float:left;resize:both;overflow:hidden") },
                { key: "ivy", enabled: () => true, exec: () => insertComponent("@chaincode/charts", {}, "display:block;width:61%;resize:both;overflow:hidden") },
                { key: "table", enabled: () => true, exec: () => insertComponent("@chaincode/table-view", {}) },
                { key: "chart", enabled: () => true, exec: () => insertComponent("@chaincode/chart-view", {}) },
            ];
            const baseSearchCommands = new TST<SearchMenu.ISearchMenuCommand<HostView>>();
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

            this.viewport.addEventListener("keydown", onKeyDown);
        });

        flowDiv.appendChild(this.viewport);
        const intelRenderable = this.intelViewer.addView();
        intelRenderable.render(insightsDiv);
    }

    // #endregion IComponentHTMLView

    public showSearchMenu(
        commands: TST<SearchMenu.ISearchMenuCommand>, foldCase: boolean,
        showAllInitially: boolean, cmdParser?: (searchString: string, cmd?: SearchMenu.ISearchMenuCommand) => void): boolean {
        this.hostSearchMenu(commands, this.viewport, foldCase, this.onComplete, cmdParser);
        if (showAllInitially) {
            this.activeSearchBox.showAllItems();
        }
        return true;
    }

    public cancelSearchMenu() {
        this.onComplete();
    }

    protected hostSearchMenu(commands: TST<SearchMenu.ISearchMenuCommand>,
                             containerElm: HTMLElement, foldCase = false, onComplete?: () => void,
                             cmdParser?: (searchString: string, cmd?: SearchMenu.ISearchMenuCommand) => void) {
        this.previouslyFocused = document.activeElement as unknown as HTMLOrSVGElement;
        this.activeSearchBox = SearchMenu.searchBoxCreate(this, containerElm,
            commands, foldCase, cmdParser);
        this.activeSearchBox.setOnExec(onComplete);
        this.activeSearchBox.focus();
    }

    private readonly onComplete = () => {
        this.previouslyFocused.focus();
        this.previouslyFocused = undefined;
        this.activeSearchBox.dismiss();
        this.activeSearchBox = undefined;
    }
}
