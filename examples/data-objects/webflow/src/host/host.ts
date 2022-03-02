/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { FlowDocument } from "../document";
import { Editor } from "../editor";
import { htmlFormatter } from "../html/formatters";
import { ICommand, KeyCode, TagName } from "../util";
import { IFormatterState, RootFormatter } from "../view/formatter";
import { debug } from "./debug";
import * as styles from "./index.css";
import { SearchMenuView } from "./searchmenu";

export class WebflowView implements IFluidHTMLView {
    public get IFluidHTMLView() { return this; }

    private searchMenu?: SearchMenuView;
    private previouslyFocused?: HTMLOrSVGElement;
    private root: Element;
    private readonly slotElement = document.createElement("p");
    private readonly searchElement = document.createElement("div");

    constructor(private readonly docP: Promise<FlowDocument>) { }

    // #region IFluidHTMLView
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

    public render(elm: HTMLElement): void {
        this.root = document.createElement("div");
        this.root.classList.add(styles.host);

        const viewportDiv = document.createElement("div");
        viewportDiv.classList.add(styles.viewport);

        this.slotElement.classList.add(styles.slot);
        viewportDiv.append(this.slotElement);

        this.searchElement.classList.add(styles.search);

        this.root.append(viewportDiv, this.searchElement);

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.docP.then((doc) => {
            let editor = new Editor(doc, this.slotElement, htmlFormatter);

            this.searchMenu = new SearchMenuView();

            const always = () => true;

            const hasSelection = () => {
                const { start, end } = editor.selection;
                return start < end;
            };

            const insertTags = (tags: TagName[]) => {
                const selection = editor.selection;
                doc.insertTags(tags, selection.start, selection.end);
            };

            const setFormat = (tag: TagName) => {
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

            const switchFormatter = (formatter: Readonly<RootFormatter<IFormatterState>>) => {
                editor.remove();
                editor = new Editor(doc, this.slotElement, formatter);
            };

            const setStyle = (style: string) => {
                const { start, end } = editor.selection;
                doc.setCssStyle(start, end, style);
            };

            this.searchMenu.attach(this.searchElement, {
                commands: [
                    { name: "blockquote", enabled: always, exec: () => { setFormat(TagName.blockquote); } },
                    { name: "bold", enabled: hasSelection, exec: () => toggleSelection(styles.bold) },
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    { name: "debug", enabled: always, exec: () => { import(/* webpackChunkName: "debug" */ "./debug.css"); this.slotElement.toggleAttribute("data-debug"); } },
                    { name: "h1", enabled: always, exec: () => { setFormat(TagName.h1); } },
                    { name: "h2", enabled: always, exec: () => { setFormat(TagName.h2); } },
                    { name: "h3", enabled: always, exec: () => { setFormat(TagName.h3); } },
                    { name: "h4", enabled: always, exec: () => { setFormat(TagName.h4); } },
                    { name: "h5", enabled: always, exec: () => { setFormat(TagName.h5); } },
                    { name: "h6", enabled: always, exec: () => { setFormat(TagName.h6); } },
                    { name: "ol", enabled: always, exec: () => { insertTags([TagName.ol, TagName.li]); } },
                    { name: "p", enabled: always, exec: () => { setFormat(TagName.p); } },
                    { name: "html", enabled: always, exec: () => { switchFormatter(htmlFormatter); } },
                    { name: "ul", enabled: always, exec: () => { insertTags([TagName.ul, TagName.li]); } },
                    { name: "red", enabled: always, exec: () => { setStyle("color:red"); } },
                ],
                onComplete: this.onComplete,
            });

            this.root.addEventListener("keydown", this.onKeyDown as EventListener);
        });

        elm.appendChild(this.root);
    }

    // #endregion IFluidHTMLView

    private readonly onKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && e.code === KeyCode.keyM) {
            this.previouslyFocused = document.activeElement as unknown as HTMLOrSVGElement;
            this.searchMenu.show();
        }
    };

    private readonly onComplete = (command?: ICommand) => {
        if (command) {
            debug(`Execute Command: ${command.name}`);
            command.exec();
        }

        this.previouslyFocused.focus();
        this.previouslyFocused = undefined;
    };
}
