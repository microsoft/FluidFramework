/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Caret as CaretUtil, Direction, Rect, TagName } from "@fluid-example/flow-util-lib";
import { FluidObject } from "@fluidframework/core-interfaces";
import { Marker, TextSegment } from "@fluidframework/merge-tree";
import { IFluidHTMLView } from "@fluidframework/view-interfaces";
import { DocSegmentKind, getComponentOptions, getCss, getDocSegmentKind } from "../document";
import * as styles from "../editor/index.css";
import { emptyObject } from "../util";
import { getAttrs, syncAttrs } from "../util/attr";

import { Formatter, IFormatterState, RootFormatter } from "../view/formatter";
import { Layout } from "../view/layout";
import { ICssProps, sameCss, syncCss } from "./css";
import { debug } from "./debug";

class HtmlFormatter extends RootFormatter<IFormatterState> {
    public begin(layout: Layout) {
        // Note: Setting the whiteSpace style to "pre-wrap" has the side-effect of suppressing period insertion
        //       on double space for MacOS.
        (layout.cursor.parent as HTMLElement).style.whiteSpace = "pre-wrap";
        return emptyObject;
    }

    public end() { }

    public visit(layout: Layout, state: Readonly<IFormatterState>) {
        const segment = layout.segment;
        const kind = getDocSegmentKind(segment);

        switch (kind) {
            case DocSegmentKind.text: {
                layout.pushFormat(paragraphFormatter, emptyObject);
                return { state, consumed: false };
            }

            case DocSegmentKind.paragraph: {
                layout.pushFormat(paragraphFormatter, emptyObject);
                return { state, consumed: true };
            }

            case DocSegmentKind.inclusion: {
                layout.pushFormat(inclusionFormatter, emptyObject);
                return { state, consumed: false };
            }

            case DocSegmentKind.beginTags: {
                layout.pushFormat(tagsFormatter, emptyObject);
                return { state, consumed: true };
            }

            case DocSegmentKind.endTags: {
                // If the DocumentFormatter encounters an 'endRange', presumably this is because the 'beginTag'
                // has not yet been inserted.  Ignore it.
                assert(layout.doc.getStart(segment as Marker) === undefined, "beginTag inserted before encountering endTag!");
                return { state, consumed: true };
            }

            default:
                throw new Error(`Unhandled DocSegmentKind '${kind}' @${layout.position}`);
        }
    }

    public onChange() { }
}

interface IInclusionState {
    root?: HTMLElement;
    slot?: HTMLElement;
    view?: Promise<IFluidHTMLView>;
}

export class InclusionFormatter extends Formatter<IInclusionState> {
    public begin(layout: Layout, init: Readonly<Partial<IInclusionState>>, prevState?: Readonly<IInclusionState>) {
        const segment = layout.segment;

        const state: IInclusionState = prevState || {};

        if (!state.root) {
            const marker = segment as Marker;

            state.root = document.createElement(TagName.span);
            state.root.contentEditable = "false";

            state.slot = document.createElement(
                getComponentOptions(segment).display === "block"
                    ? TagName.div
                    : TagName.span);

            const viewFactory = layout.viewFactoryRegistry.get(marker.properties.view);
            state.view = layout.doc.getComponentFromMarker(marker).then((component: FluidObject) => {
                if (viewFactory) {
                    // We found a view class registered for this marker's view type
                    const view = viewFactory.createView(component, layout.scope);
                    view.render(state.slot);
                    CaretUtil.caretEnter(state.slot, Direction.right, Rect.empty);
                    state.slot.focus();
                    return view;
                }
            });
        }

        syncCss(state.root, getCss(segment), styles.inclusion);
        layout.pushNode(state.root);
        layout.emitNode(state.slot);
        return state;
    }

    public visit(layout: Layout, state: Readonly<IInclusionState>) {
        assert(getDocSegmentKind(layout.segment) === DocSegmentKind.inclusion, "Layout segment has unexpected kind!");
        layout.popFormat();
        return { state, consumed: true };
    }

    public end(layout: Layout) {
        layout.popNode();
    }
}

interface ITagsState extends IFormatterState { root?: HTMLElement; pTag: TagName; popCount: number; }
interface ITagsProps { tags?: TagName[]; }

class TagsFormatter extends Formatter<ITagsState> {
    public begin(layout: Layout, init: Readonly<Partial<ITagsState>>, prevState: Readonly<ITagsState>) {
        const state: Partial<ITagsState> = prevState
            ? { ...prevState }
            : {};

        const segment = layout.segment;
        const props: ITagsProps = (segment && segment.properties) || emptyObject;
        const tags = props.tags;

        state.root = layout.pushTag(tags[0]);
        const root = state.root;
        syncCss(root, getCss(segment), undefined);
        syncAttrs(root, getAttrs(segment));
        for (let index = 1; index < tags.length; index++) {
            layout.pushTag(tags[index]);
        }

        state.popCount = tags.length;
        state.pTag = tags[tags.length - 1];
        return state as ITagsState;
    }

    public visit(layout: Layout, state: Readonly<ITagsState>) {
        const segment = layout.segment;
        const kind = getDocSegmentKind(segment);

        switch (kind) {
            case DocSegmentKind.text: {
                layout.emitText((segment as TextSegment).text);
                return { state, consumed: true };
            }

            case DocSegmentKind.paragraph: {
                layout.popNode();
                const pg = layout.pushTag(state.pTag);
                syncCss(pg, getCss(segment), undefined);
                return { state, consumed: true };
            }

            case DocSegmentKind.inclusion: {
                layout.pushFormat(inclusionFormatter, emptyObject);
                return { state, consumed: false };
            }

            case DocSegmentKind.beginTags: {
                layout.pushFormat(tagsFormatter, emptyObject);
                return { state, consumed: true };
            }

            case DocSegmentKind.endTags: {
                layout.popFormat();
                return { state, consumed: true };
            }

            default:
                debug("%s@%d: Unhanded DocSegmentKind '%s'.", this, layout.position, kind);
                layout.popFormat();
                return { state, consumed: false };
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
    constructor(private readonly defaultTag: TagName) { super(); }

    public begin(layout: Layout, init: IParagraphState, prevState: IParagraphState) {
        const state: Partial<IParagraphState> = prevState
            ? { ...prevState }
            : {};

        const segment = layout.segment;
        const tag = (segment.properties && segment.properties.tag) || this.defaultTag;
        state.root = layout.pushTag(tag);
        syncCss(state.root, getCss(segment), undefined);

        return state;
    }

    public visit(layout: Layout, state: Readonly<IParagraphState>) {
        const segment = layout.segment;
        const kind = getDocSegmentKind(segment);

        switch (kind) {
            case DocSegmentKind.text: {
                layout.pushFormat(textFormatter, emptyObject);
                return { state, consumed: false };
            }

            case DocSegmentKind.paragraph: {
                layout.popFormat();
                layout.pushFormat(this, emptyObject);
                return { state, consumed: true };
            }

            case DocSegmentKind.beginTags: {
                layout.pushFormat(tagsFormatter, emptyObject);
                return { state, consumed: true };
            }

            case DocSegmentKind.inclusion: {
                // If the inclusion is a block, it implicitly terminates the current paragraph.
                if (getComponentOptions(segment).display === "block") {
                    layout.popFormat();
                }

                layout.pushFormat(inclusionFormatter, emptyObject);
                return { state, consumed: false };
            }

            default:
                debug("%s@%d: Unhanded DocSegmentKind '%s'.", this, layout.position, kind);
                layout.popFormat();
                return { state, consumed: false };
        }
    }

    public end(layout: Layout, state: Readonly<IParagraphState>) {
        layout.emitTag(TagName.br);
        layout.popNode();
    }
}

interface ITextState extends IFormatterState { root?: HTMLElement; css?: ICssProps; }

class TextFormatter extends Formatter<ITextState> {
    public begin(layout: Layout, init: Readonly<Partial<ITextState>>, prevState: Readonly<ITextState>) {
        const state: Partial<ITextState> = prevState
            ? { ...prevState }
            : {};
        state.root = layout.pushTag(TagName.span);
        state.css = getCss(layout.segment);
        syncCss(state.root, state.css, undefined);
        return state;
    }

    public visit(layout: Layout, state: Readonly<ITextState>) {
        const segment = layout.segment;
        const kind = getDocSegmentKind(segment);

        switch (kind) {
            case DocSegmentKind.text: {
                if (!sameCss(segment, state.css)) {
                    layout.popFormat();
                    return { state, consumed: false };
                }
                layout.emitText((segment as TextSegment).text);
                return { state, consumed: true };
            }

            default:
                debug("%s@%d: Unhanded DocSegmentKind '%s'.", this, layout.position, kind);
                layout.popFormat();
                return { state, consumed: false };
        }
    }

    public end(layout: Layout, state: Readonly<ITextState>) {
        layout.popNode();
    }
}

export const htmlFormatter = Object.freeze(new HtmlFormatter());
const inclusionFormatter = Object.freeze(new InclusionFormatter());
const paragraphFormatter = Object.freeze(new ParagraphFormatter(TagName.p));
const tagsFormatter = Object.freeze(new TagsFormatter());
const textFormatter = Object.freeze(new TextFormatter());
