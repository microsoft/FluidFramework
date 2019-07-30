/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHTMLOptions, IComponentHTMLView } from "@prague/container-definitions";
import { ICommand, KeyCode, Template } from "@prague/flow-util";
import { FlowDocument } from "../document";
import { Editor } from "../editor";
import { Tag } from "../util/tag";
import { debug } from "./debug";
import * as styles from "./index.css";
import { SearchMenuView } from "./searchmenu";

const template = new Template(
    { tag: "div", props: { className: styles.host }, children: [
        { tag: "div", ref: "viewport", props: { type: "text", className: styles.viewport }, children: [
            { tag: "div", ref: "slot", props: { className: styles.slot } },
        ]},
        { tag: "div", ref: "search", props: { type: "text", className: styles.search }},
    ]});

export class WebflowView implements IComponentHTMLView {

    public get IComponentHTMLView() { return this; }
    public get IComponentHTMLRender() { return this; }

    private searchMenu?: SearchMenuView;
    private previouslyFocused?: HTMLOrSVGElement;
    private root: Element;

    constructor(private readonly docP: Promise<FlowDocument>) {}

    // #region IComponentHTMLView
    public remove(): void {
        if (this.root) {
            this.root.remove();
            this.root = undefined;
        }

        if (this.searchMenu) {
            this.searchMenu.detach();
            this.searchMenu = undefined;
        }
    }

    public render(elm: HTMLElement, options: IComponentHTMLOptions): void {
        this.root = template.clone();

        this.docP.then((doc) => {
            const slot = template.get(this.root, "slot") as HTMLElement;
            const editor = new Editor(doc, slot);

            this.searchMenu = new SearchMenuView();

            const hasSelection = () => {
                const { start, end } = editor.selection;
                return start < end;
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

            this.searchMenu.attach(template.get(this.root, "search"), {
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

            this.root.addEventListener("keydown", this.onKeyDown as EventListener);
        });

        elm.appendChild(this.root);
    }

    public query<T>(): T { throw new Error("Method not implemented."); }
    public list(): string[] { throw new Error("Method not implemented."); }
    // #endregion IComponentHTMLView

    private readonly onKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.code === KeyCode.keyM) {
            this.previouslyFocused = document.activeElement as unknown as HTMLOrSVGElement;
            this.searchMenu.show();
        }
    }

    private readonly onComplete = (command?: ICommand) => {
        if (command) {
            debug(`Execute Command: ${command.name}`);
            command.exec();
        }

        this.previouslyFocused.focus();
        this.previouslyFocused = undefined;
    }
}
