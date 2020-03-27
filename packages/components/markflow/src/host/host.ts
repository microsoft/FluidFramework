/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICommand, KeyCode, Template } from "@fluid-example/flow-util-lib";
import { IComponentHTMLOptions, IComponentHTMLView } from "@microsoft/fluid-view-interfaces";
import { FlowDocument } from "../document";
import { Editor } from "../editor";
import { markdownFormatter } from "../markdown/formatters";
import { markdownHighlightFormatter } from "../markdown/highlighter";
import { plainTextFormatter } from "../plaintext/formatter";
import { IFormatterState, RootFormatter } from "../view/formatter";
import { debug } from "./debug";
import * as styles from "./index.css";
import { SearchMenuView } from "./searchmenu";

const template = new Template(
    { tag: "div", props: { className: styles.host }, children: [
        { tag: "div", props: { className: styles.viewport }, children: [
            { tag: "div", props: { className: styles.page }, children: [
                { tag: "div", props: { className: styles.title }, children: [
                    { tag: "h1", ref: "titleText" },
                    { tag: "hr" },
                ]},
                { tag: "div", props: { className: styles.outline }, children: [
                    { tag: "p", ref: "slot", props: { className: styles.slot } },
                ]},
            ]},
        ]},
        { tag: "div", ref: "search", props: { className: styles.searchMenu }},
        { tag: "div", ref: "status", props: { className: styles.status }},
    ]});

export class WebflowView implements IComponentHTMLView {

    public get IComponentHTMLView() { return this; }

    private searchMenu?: SearchMenuView;
    private previouslyFocused?: HTMLOrSVGElement;
    private root: Element;

    constructor(private readonly docP: Promise<FlowDocument>, private readonly title: string) { }

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
        template.get(this.root, "titleText").textContent = this.title;

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.docP.then((doc) => {
            const slot = template.get(this.root, "slot") as HTMLElement;
            let editor = new Editor(doc, slot, markdownFormatter);

            this.searchMenu = new SearchMenuView();

            const switchFormatter = (formatter: Readonly<RootFormatter<IFormatterState>>) => {
                editor.remove();
                editor = new Editor(doc, slot, formatter);
            };

            this.searchMenu.attach(template.get(this.root, "search"), {
                commands: [
                    // eslint-disable-next-line @typescript-eslint/no-floating-promises
                    { name: "debug", enabled: () => true, exec: () => { import(/* webpackChunkName: "debug" */ "./debug.css"); slot.toggleAttribute("data-debug"); } },
                    { name: "md", enabled: () => true, exec: () => { switchFormatter(markdownFormatter); } },
                    { name: "smd", enabled: () => true, exec: () => { switchFormatter(markdownHighlightFormatter); } },
                    { name: "text", enabled: () => true, exec: () => { switchFormatter(plainTextFormatter); } },
                ],
                onComplete: this.onComplete,
            });

            this.root.addEventListener("keydown", this.onKeyDown as EventListener);

            const status = template.get(this.root, "status") as HTMLElement;
            window.setInterval(() => {
                status.textContent = `@${editor.selection.end}/${doc.length}`;
            }, 100);
        });

        elm.appendChild(this.root);
    }

    // #endregion IComponentHTMLView

    private readonly onKeyDown = (e: KeyboardEvent) => {
        if (e.ctrlKey && (e.code === KeyCode.keyM || e.code === KeyCode.space)) {
            this.previouslyFocused = document.activeElement as unknown as HTMLOrSVGElement;
            this.searchMenu.show();
            e.preventDefault();
            e.stopPropagation();
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
