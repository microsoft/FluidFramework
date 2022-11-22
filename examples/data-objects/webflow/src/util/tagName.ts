/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Constant enumeration of legal values returned by HTMLElement.tagName property.
 *
 * @remarks Note: `TagName` are uppercase for comparison '===' with the 'tagName' property of Element.
 * Unfortunately, this is the opposite of the casing used for document.createElement().
 */
export const enum TagName {
    a = "A",
    abbr = "ABBR",
    address = "ADDRESS",
    area = "AREA",
    article = "ARTICLE",
    aside = "ASIDE",
    audio = "AUDIO",
    b = "B",
    base = "BASE",
    bdi = "BDI",
    bdo = "BDO",
    blockquote = "BLOCKQUOTE",
    body = "BODY",
    br = "BR",
    button = "BUTTON",
    canvas = "CANVAS",
    caption = "CAPTION",
    cite = "CITE",
    code = "CODE",
    col = "COL",
    colgroup = "COLGROUP",
    data = "DATA",
    datalist = "DATALIST",
    dd = "DD",
    del = "DEL",
    details = "DETAILS",
    dfn = "DFN",
    dialog = "DIALOG",
    div = "DIV",
    dl = "DL",
    dt = "DT",
    em = "EM",
    embed = "EMBED",
    fieldset = "FIELDSET",
    figcaption = "FIGCAPTION",
    figure = "FIGURE",
    footer = "FOOTER",
    form = "FORM",
    h1 = "H1",
    h2 = "H2",
    h3 = "H3",
    h4 = "H4",
    h5 = "H5",
    h6 = "H6",
    head = "HEAD",
    header = "HEADER",
    hr = "HR",
    html = "HTML",
    i = "I",
    iframe = "IFRAME",
    img = "IMG",
    input = "INPUT",
    ins = "INS",
    kbd = "KBD",
    keygen = "KEYGEN",
    label = "LABEL",
    legend = "LEGEND",
    li = "LI",
    link = "LINK",
    main = "MAIN",
    map = "MAP",
    mark = "MARK",
    menu = "MENU",
    menuitem = "MENUITEM",
    meta = "META",
    meter = "METER",
    nav = "NAV",
    noscript = "NOSCRIPT",
    object = "OBJECT",
    ol = "OL",
    optgroup = "OPTGROUP",
    option = "OPTION",
    output = "OUTPUT",
    p = "P",
    param = "PARAM",
    picture = "PICTURE",
    pre = "PRE",
    progress = "PROGRESS",
    q = "Q",
    rb = "RB",
    rbc = "RBC",
    rp = "RP",
    rt = "RT",
    rtc = "RTC",
    ruby = "RUBY",
    s = "S",
    samp = "SAMP",
    script = "SCRIPT",
    section = "SECTION",
    select = "SELECT",
    slot = "SLOT",
    small = "SMALL",
    source = "SOURCE",
    span = "SPAN",
    strong = "STRONG",
    style = "STYLE",
    sub = "SUB",
    summary = "SUMMARY",
    sup = "SUP",
    table = "TABLE",
    tbody = "TBODY",
    td = "TD",
    template = "TEMPLATE",
    textarea = "TEXTAREA",
    tfoot = "TFOOT",
    th = "TH",
    thead = "THEAD",
    time = "TIME",
    title = "TITLE",
    tr = "TR",
    track = "TRACK",
    u = "U",
    ul = "UL",
    var = "VAR",
    video = "VIDEO",
    wbr = "WBR",
}

// Note: Similar to the `HTMLElementTagNameMap` defined in lib.dom.d.ts, except that keys are uppercase.
interface TagMap {
    [TagName.a]: HTMLAnchorElement;
    [TagName.abbr]: HTMLElement; // HTMLAbbrElement,
    [TagName.address]: HTMLElement; // HTMLAddressElement,
    [TagName.area]: HTMLAreaElement;
    [TagName.article]: HTMLElement; // HTMLArticleElement,
    [TagName.aside]: HTMLElement; // HTMLAsideElement,
    [TagName.audio]: HTMLAudioElement;
    [TagName.b]: HTMLElement; // HTMLBElement,
    [TagName.base]: HTMLBaseElement;
    [TagName.bdi]: HTMLElement; // HTMLBdiElement,
    [TagName.bdo]: HTMLElement; // HTMLBdoElement,
    [TagName.blockquote]: HTMLQuoteElement; // HTMLBlockquoteElement,
    [TagName.body]: HTMLBodyElement;
    [TagName.br]: HTMLBRElement;
    [TagName.button]: HTMLButtonElement;
    [TagName.canvas]: HTMLCanvasElement;
    [TagName.caption]: HTMLTableCaptionElement;
    [TagName.cite]: HTMLElement; // HTMLCiteElement,
    [TagName.code]: HTMLElement; // HTMLCodeElement,
    [TagName.col]: HTMLTableColElement;
    [TagName.colgroup]: HTMLTableColElement; // HTMLColGroupElement,
    [TagName.data]: HTMLDataElement;
    [TagName.datalist]: HTMLDataListElement;
    [TagName.dd]: HTMLElement; // HTMLDdElement,
    [TagName.del]: HTMLModElement; // HTMLDelElement,
    [TagName.details]: HTMLDetailsElement;
    [TagName.dfn]: HTMLElement; // HTMLDfnElement,
    [TagName.dialog]: HTMLDialogElement;
    [TagName.div]: HTMLDivElement;
    [TagName.dl]: HTMLDListElement;
    [TagName.dt]: HTMLElement; // HTMLDtElement,
    [TagName.em]: HTMLElement; // HTMLEmElement,
    [TagName.embed]: HTMLEmbedElement;
    [TagName.fieldset]: HTMLFieldSetElement;
    [TagName.figcaption]: HTMLElement; // HTMLFigcaptionElement,
    [TagName.figure]: HTMLElement; // HTMLFigureElement,
    [TagName.footer]: HTMLElement; // HTMLFooterElement,
    [TagName.form]: HTMLFormElement;
    [TagName.h1]: HTMLHeadingElement; // HTMLH1Element,
    [TagName.h2]: HTMLHeadingElement; // HTMLH2Element,
    [TagName.h3]: HTMLHeadingElement; // HTMLH3Element,
    [TagName.h4]: HTMLHeadingElement; // HTMLH4Element,
    [TagName.h5]: HTMLHeadingElement; // HTMLH5Element,
    [TagName.h6]: HTMLHeadingElement; // HTMLH6Element,
    [TagName.head]: HTMLHeadElement;
    [TagName.header]: HTMLElement; // HTMLHeaderElement,
    [TagName.hr]: HTMLHRElement;
    [TagName.html]: HTMLHtmlElement;
    [TagName.i]: HTMLElement; // HTMLIElement,
    [TagName.iframe]: HTMLIFrameElement;
    [TagName.img]: HTMLImageElement;
    [TagName.input]: HTMLInputElement;
    [TagName.ins]: HTMLModElement; // HTMLInsElement,
    [TagName.kbd]: HTMLElement; // HTMLKbdElement,
    [TagName.keygen]: HTMLElement; // HTMLKeygenElement,
    [TagName.label]: HTMLLabelElement;
    [TagName.legend]: HTMLLegendElement;
    [TagName.li]: HTMLLIElement;
    [TagName.link]: HTMLLinkElement;
    [TagName.main]: HTMLElement; // HTMLMainElement,
    [TagName.map]: HTMLMapElement;
    [TagName.mark]: HTMLElement; // HTMLMarkElement,
    [TagName.menu]: HTMLMenuElement;
    [TagName.menuitem]: HTMLElement; // HTMLMenuItemElement,
    [TagName.meta]: HTMLMetaElement;
    [TagName.meter]: HTMLMeterElement;
    [TagName.nav]: HTMLElement; // HTMLNavElement,
    [TagName.noscript]: HTMLElement; // HTMLNoscriptElement,
    [TagName.object]: HTMLObjectElement;
    [TagName.ol]: HTMLOListElement;
    [TagName.optgroup]: HTMLOptGroupElement;
    [TagName.option]: HTMLOptionElement;
    [TagName.output]: HTMLOutputElement;
    [TagName.p]: HTMLParagraphElement;
    [TagName.param]: HTMLParamElement;
    [TagName.picture]: HTMLPictureElement;
    [TagName.pre]: HTMLPreElement;
    [TagName.progress]: HTMLProgressElement;
    [TagName.q]: HTMLQuoteElement;
    [TagName.rb]: HTMLElement; // HTMLRbElement,
    [TagName.rbc]: HTMLElement; // HTMLRbcElement,
    [TagName.rp]: HTMLElement; // HTMLRpElement,
    [TagName.rt]: HTMLElement; // HTMLRtElement,
    [TagName.rtc]: HTMLElement; // HTMLRtcElement,
    [TagName.ruby]: HTMLElement; // HTMLRubyElement,
    [TagName.s]: HTMLElement; // HTMLSElement,
    [TagName.samp]: HTMLElement; // HTMLSampElement,
    [TagName.script]: HTMLScriptElement;
    [TagName.section]: HTMLElement; // HTMLSectionElement,
    [TagName.select]: HTMLSelectElement;
    [TagName.slot]: HTMLSlotElement;
    [TagName.small]: HTMLElement; // HTMLSmallElement,
    [TagName.source]: HTMLSourceElement;
    [TagName.span]: HTMLSpanElement;
    [TagName.strong]: HTMLElement; // HTMLStrongElement,
    [TagName.style]: HTMLStyleElement;
    [TagName.sub]: HTMLElement; // HTMLSubElement,
    [TagName.summary]: HTMLElement; // HTMLSummaryElement,
    [TagName.sup]: HTMLElement; // HTMLSupElement,
    [TagName.table]: HTMLTableElement;
    [TagName.tbody]: HTMLTableSectionElement; // HTMLTbodyElement,
    [TagName.td]: HTMLTableDataCellElement;
    [TagName.template]: HTMLTemplateElement;
    [TagName.textarea]: HTMLTextAreaElement;
    [TagName.tfoot]: HTMLTableSectionElement; // HTMLTfootElement,
    [TagName.th]: HTMLTableHeaderCellElement;
    [TagName.thead]: HTMLTableSectionElement; // HTMLTheadElement,
    [TagName.time]: HTMLTimeElement;
    [TagName.title]: HTMLTitleElement;
    [TagName.tr]: HTMLTableRowElement;
    [TagName.track]: HTMLTrackElement;
    [TagName.u]: HTMLElement; // HTMLUElement,
    [TagName.ul]: HTMLUListElement;
    [TagName.var]: HTMLElement; // HTMLVarElement,
    [TagName.video]: HTMLVideoElement;
    [TagName.wbr]: HTMLElement; // HTMLWbrElement,
}

/** Type guard that returns true if the given `node` is an `Element`. */
export function isElementNode(node: Node | Element): node is Element {
    // Note that Node.ELEMENT_NODE is specified to alway be the constant '1'.
    // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
    return node.nodeType === 1;
}

/** Type guard that returns true if the given `node` is a `Text` node. */
export function isTextNode(node: Node): node is Text {
    // Note that Node.TEXT_NODE is specified to alway be the constant '3'.
    // https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
    return node.nodeType === 3;
}

/** Type guard that returns true if the given `node` has the given `tagName`. */
export function hasTagName<K extends keyof TagMap>(node: Node | Element, tagName: K): node is TagMap[K] {
    return (node as Element).tagName === tagName;
}
