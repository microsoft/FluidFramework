/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocSegmentKind } from "../document";

// Note: Tag values must be uppercase for comparison '===' with the 'tagName' property of Element.
export const enum Tag {
    a           = "A",
    abbr        = "ABBR",
    address     = "ADDRESS",
    area        = "AREA",
    article     = "ARTICLE",
    aside       = "ASIDE",
    audio       = "AUDIO",
    b           = "B",
    base        = "BASE",
    bdi         = "BDI",
    bdo         = "BDO",
    blockquote  = "BLOCKQUOTE",
    body        = "BODY",
    br          = "BR",
    button      = "BUTTON",
    canvas      = "CANVAS",
    caption     = "CAPTION",
    cite        = "CITE",
    code        = "CODE",
    col         = "COL",
    colgroup    = "COLGROUP",
    data        = "DATA",
    datalist    = "DATALIST",
    dd          = "DD",
    del         = "DEL",
    details     = "DETAILS",
    dfn         = "DFN",
    dialog      = "DIALOG",
    div         = "DIV",
    dl          = "DL",
    dt          = "DT",
    em          = "EM",
    embed       = "EMBED",
    fieldset    = "FIELDSET",
    figcaption  = "FIGCAPTION",
    figure      = "FIGURE",
    footer      = "FOOTER",
    form        = "FORM",
    h1          = "H1",
    h2          = "H2",
    h3          = "H3",
    h4          = "H4",
    h5          = "H5",
    h6          = "H6",
    head        = "HEAD",
    header      = "HEADER",
    hr          = "HR",
    html        = "HTML",
    i           = "I",
    iframe      = "IFRAME",
    img         = "IMG",
    input       = "INPUT",
    ins         = "INS",
    kbd         = "KBD",
    keygen      = "KEYGEN",
    label       = "LABEL",
    legend      = "LEGEND",
    li          = "LI",
    link        = "LINK",
    main        = "MAIN",
    map         = "MAP",
    mark        = "MARK",
    menu        = "MENU",
    menuitem    = "MENUITEM",
    meta        = "META",
    meter       = "METER",
    nav         = "NAV",
    noscript    = "NOSCRIPT",
    object      = "OBJECT",
    ol          = "OL",
    optgroup    = "OPTGROUP",
    option      = "OPTION",
    output      = "OUTPUT",
    p           = "P",
    param       = "PARAM",
    picture     = "PICTURE",
    pre         = "PRE",
    progress    = "PROGRESS",
    q           = "Q",
    rb          = "RB",
    rbc         = "RBC",
    rp          = "RP",
    rt          = "RT",
    rtc         = "RTC",
    ruby        = "RUBY",
    s           = "S",
    samp        = "SAMP",
    script      = "SCRIPT",
    section     = "SECTION",
    select      = "SELECT",
    slot        = "SLOT",
    small       = "SMALL",
    source      = "SOURCE",
    span        = "SPAN",
    strong      = "STRONG",
    style       = "STYLE",
    sub         = "SUB",
    summary     = "SUMMARY",
    sup         = "SUP",
    table       = "TABLE",
    tbody       = "TBODY",
    td          = "TD",
    template    = "TEMPLATE",
    textarea    = "TEXTAREA",
    tfoot       = "TFOOT",
    th          = "TH",
    thead       = "THEAD",
    time        = "TIME",
    title       = "TITLE",
    tr          = "TR",
    track       = "TRACK",
    u           = "U",
    ul          = "UL",
    var         = "VAR",
    video       = "VIDEO",
    wbr         = "WBR",
}

export function hasTag(node: Node | Element, tag: Tag): node is HTMLElement {
    return node && "tagName" in node && node.tagName === tag;
}

const segmentKindToIdPrefix = {
    [DocSegmentKind.beginTags]: "b:",
    [DocSegmentKind.endTags]:   "e:",
};

const segmentKindToOppositeIdPrefix = {
    [DocSegmentKind.beginTags]: "e:",
    [DocSegmentKind.endTags]:   "b:",
};

export function createTags(tags: Tag[]) {
    const root = document.createElement(tags[0]);
    let slot: HTMLElement = root;
    for (let i = 1; i < tags.length; i++) {
        slot.appendChild(document.createElement(tags[i]));
        slot = slot.lastElementChild as HTMLElement;
    }
    return { root, slot };
}

export function addIdPrefix(kind: DocSegmentKind, id: string) {
    const prefix = segmentKindToIdPrefix[kind];
    return prefix
        ? `${prefix}${id}`
        : id;
}

export function removeIdPrefix(kind: DocSegmentKind, id: string) {
    const prefix = segmentKindToIdPrefix[kind];
    return prefix
        ? id.slice(prefix.length)
        : id;
}

export function getIdForOpposite(kind: DocSegmentKind, id: string) {
    const oldPrefix = segmentKindToIdPrefix[kind];
    const newPrefix = segmentKindToOppositeIdPrefix[kind];

    return `${newPrefix}${id.slice(oldPrefix.length)}`;
}
