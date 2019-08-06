/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent, IComponentHTMLView } from "@prague/component-core-interfaces";
import { Caret as CaretUtil, Direction, Rect } from "@prague/flow-util";
import { Marker } from "@prague/merge-tree";
import * as assert from "assert";
import { DocSegmentKind, getComponentOptions, getCss, getDocSegmentKind } from "../../document";
import { emptyObject } from "../../util";
import { Tag } from "../../util/tag";
import { debug } from "../debug";
import * as styles from "../index.css";
import { ICssProps, sameCss, syncCss } from "./css";
import { Formatter, IFormatterState } from "./formatter";
import { Layout } from "./layout";

class DocumentFormatter extends Formatter<IFormatterState> {
    public begin(): never { throw new Error(); }
    public end(): never { throw new Error(); }

    public visit(layout: Layout, state: IFormatterState) {
        const segment = layout.segment;
        const kind = getDocSegmentKind(segment);

        switch (kind) {
            case DocSegmentKind.text: {
                layout.pushFormat(paragraphFormatter);
                return false;
            }

            case DocSegmentKind.paragraph: {
                layout.pushFormat(paragraphFormatter);
                return true;
            }

            case DocSegmentKind.inclusion: {
                layout.pushFormat(inclusionFormatter);
                return false;
            }

            case DocSegmentKind.beginTags: {
                layout.pushFormat(tagsFormatter);
                return true;
            }

            case DocSegmentKind.endTags: {
                // If the DocumentFormatter encounters an 'endRange', presumably this is because the 'beginTag'
                // has not yet been inserted.  Ignore it.
                assert.strictEqual(layout.doc.getStart(segment as Marker), undefined);
                return true;
            }

            default:
                assert.fail(`Unhandled DocSegmentKind '${kind}' @${layout.position}`);
        }
    }
}

interface IInclusionState {
    root?: HTMLElement;
    slot?: HTMLElement;
    view?: Promise<IComponentHTMLView>;
}

export class InclusionFormatter extends Formatter<IInclusionState> {
    public begin(layout: Layout, state: IInclusionState) {
        const segment = layout.segment;
        if (!state.root) {
            const marker = segment as Marker;

            state.root = document.createElement(Tag.span);
            state.root.contentEditable = "false";

            state.slot = document.createElement(
                getComponentOptions(segment).display === "block"
                    ? Tag.div
                    : Tag.span);

            state.view = layout.doc.getComponentFromMarker(marker).then((component: IComponent) => {
                const visual = component.IComponentHTMLVisual;
                const view: IComponentHTMLView = visual.addView
                    ? visual.addView(layout.scope)
                    : {
                        IComponentHTMLRender: visual,
                        render: visual.render.bind(visual),
                        remove: state.slot.remove.bind(state.slot),
                    };

                view.render(state.slot);
                CaretUtil.caretEnter(state.slot, Direction.right, Rect.empty);
                state.slot.focus();
                return view;
            });
        }

        syncCss(state.root, getCss(segment), styles.inclusion);
        layout.pushNode(state.root);
        layout.emitNode(state.slot);
    }

    public visit(layout: Layout) {
        assert.strictEqual(getDocSegmentKind(layout.segment), DocSegmentKind.inclusion);
        layout.popFormat();
        return true;
    }

    public end(layout: Layout) {
        layout.popNode();
    }
}

interface ITagsState extends IFormatterState { root?: HTMLElement; pTag: Tag; popCount: number; }
interface ITagsProps { tags?: Tag[]; }

class TagsFormatter extends Formatter<ITagsState> {
    public begin(layout: Layout, state: ITagsState) {
        const segment = layout.segment;
        const props: ITagsProps = (segment && segment.properties) || emptyObject;
        const tags = props.tags;

        state.root = this.pushTag(layout, tags[0], state.root) as HTMLElement;
        const root = state.root;
        syncCss(root, getCss(segment), undefined);

        for (let index = 1, existing: Element = root; index < tags.length; index++) {
            existing = this.pushTag(layout, tags[index], existing && existing.firstElementChild);
        }

        state.popCount = tags.length;
        state.pTag = tags[tags.length - 1];
    }

    public visit(layout: Layout, state: Readonly<ITagsState>) {
        const segment = layout.segment;
        const kind = getDocSegmentKind(segment);

        switch (kind) {
            case DocSegmentKind.text: {
                layout.emitText();
                return true;
            }

            case DocSegmentKind.paragraph: {
                layout.popNode();
                const previous = layout.cursor.previous;
                const pg = this.pushTag(layout, Tag.li, previous && previous.nextSibling);
                syncCss(pg as HTMLElement, getCss(segment), undefined);
                return true;
            }

            case DocSegmentKind.inclusion: {
                layout.pushFormat(inclusionFormatter);
                return false;
            }

            case DocSegmentKind.endTags: {
                layout.popFormat();
                return true;
            }

            default:
                debug("%s@%d: Unhanded DocSegmentKind '%s'.", this, layout.position, kind);
                layout.popFormat();
                return false;
        }
    }

    public end(layout: Layout, state: Readonly<ITagsState>) {
        for (let i = state.popCount; i > 0; i--) {
            layout.popNode();
        }
    }
}

interface IParagraphState extends IFormatterState { root?: HTMLElement; }

class ParagraphFormatter extends Formatter<IParagraphState> {
    constructor(private readonly defaultTag: Tag) { super(); }

    public begin(layout: Layout, state: IParagraphState) {
        const segment = layout.segment;
        // tslint:disable-next-line:strict-boolean-expressions
        const tag = (segment.properties && segment.properties.tag) || this.defaultTag;
        state.root = this.pushTag(layout, tag, state.root) as HTMLElement;
        syncCss(state.root, getCss(segment), undefined);
    }

    public visit(layout: Layout, state: Readonly<IParagraphState>) {
        const segment = layout.segment;
        const kind = getDocSegmentKind(segment);

        switch (kind) {
            case DocSegmentKind.text: {
                layout.pushFormat(textFormatter);
                return false;
            }

            case DocSegmentKind.paragraph: {
                layout.popFormat();
                layout.pushFormat(this);
                return true;
            }

            case DocSegmentKind.inclusion: {
                // If the inclusion is a block, it implicitly terminates the current paragraph.
                if (getComponentOptions(segment).display === "block") {
                    layout.popFormat();
                }

                layout.pushFormat(inclusionFormatter);
                return false;
            }

            default:
                debug("%s@%d: Unhanded DocSegmentKind '%s'.", this, layout.position, kind);
                layout.popFormat();
                return false;
        }
    }

    public end(layout: Layout, state: Readonly<IParagraphState>) {
        if (!layout.cursor.previous) {
            this.emitTag(layout, Tag.br, state.root.lastElementChild);
        }
        layout.popNode();
    }
}

interface ITextState extends IFormatterState { root?: HTMLElement; css?: ICssProps; }

class TextFormatter extends Formatter<ITextState> {
    public begin(layout: Layout, state: ITextState) {
        state.root = this.pushTag(layout, Tag.span, state.root) as HTMLElement;
        state.css = getCss(layout.segment);
        syncCss(state.root, state.css, undefined);
    }

    public visit(layout: Layout, state: Readonly<ITextState>) {
        const segment = layout.segment;
        const kind = getDocSegmentKind(segment);

        switch (kind) {
            case DocSegmentKind.text: {
                if (!sameCss(segment, state.css)) {
                    layout.popFormat();
                    return false;
                }
                layout.emitText();
                return true;
            }

            default:
                debug("%s@%d: Unhanded DocSegmentKind '%s'.", this, layout.position, kind);
                layout.popFormat();
                return false;
        }
    }

    public end(layout: Layout, state: Readonly<ITextState>) {
        layout.popNode();
    }
}

export const documentFormatter = Object.freeze(new DocumentFormatter());
const inclusionFormatter = Object.freeze(new InclusionFormatter());
const paragraphFormatter = Object.freeze(new ParagraphFormatter(Tag.p));
const tagsFormatter = Object.freeze(new TagsFormatter());
const textFormatter = Object.freeze(new TextFormatter());
