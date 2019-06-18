/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IMapWrapper, IMapWrapperFactory } from "./mapWrapper";

class HTMLUtil {
    public static getOrigin(): string {
        let origin = window.location.origin;
        if (window.location.port) {
            origin += ":" + window.location.port;
        }
        return origin;
    }

    public static getPath(): string {
        const index = window.location.pathname.lastIndexOf("/");
        return window.location.pathname.substring(0, index + 1);
    }

    public static patchStyleUrl(str: string) {
        if (!str) { return str; }
        // TODO: Do style URL patching properly
        const origin = HTMLUtil.getOrigin();
        const path = HTMLUtil.getPath();
        let outStr = str;
        outStr = outStr.replace(/url\(\/\//g, "url(http://");
        outStr = outStr.replace(/url\('\/\//g, "url('http://");
        outStr = outStr.replace(/url\(\"\/\//g, "url(\"http://");
        outStr = outStr.replace(/url\(\//g, "url(" + origin + "/");
        outStr = outStr.replace(/url\('\//g, "url('" + origin + "/");
        outStr = outStr.replace(/url\(\"\//g, "url(\"" + origin + "/");
        outStr = outStr.replace(/url\(\.\.\//g, "url(" + origin + path + "../");
        outStr = outStr.replace(/url\(\'\.\.\//g, "url('" + origin + path + "../");
        return outStr;
    }

    public static htmlEncode(str) {
        // TODO: use a proper html encode function
        return str.replace(/\"/g, "&quot;").replace(/\</g, "&lt;").replace(/\>/g, "&gt;");
    }
}

export interface IRewriteDOMNodeData {
    getHTML(): string;
    getJSON();
    getMap(mapWrapperFactory: IMapWrapperFactory): IMapWrapper;
}

export interface IRewriteDOMTree {
    getElementNode(e: Element): IRewriteDOMNodeData | undefined;
    getTextNode(n: Node): IRewriteDOMNodeData | undefined;
}

export class RewriteDOMTree implements IRewriteDOMTree {
    protected rootElement: IRewriteDOMNodeData;
    public initializeFromDOM(doc: Document) {
        this.rootElement = this.getElementNode(doc.documentElement);
    }

    public getHTML(): string {
        return "<!DOCTYPE HTML>" + this.rootElement.getHTML();
    }

    public getJSONString(): string {
        return JSON.stringify(this.rootElement.getJSON());
    }

    public getMap(mapWrapperFactory: IMapWrapperFactory): IMapWrapper {
        return this.rootElement.getMap(mapWrapperFactory);
    }
    public getElementNode(e: Element): IRewriteDOMNodeData | undefined {
        if (this.isFiltered(e)) {
            return;
        }
        if (e.tagName === "LINK") {
            if ((e as HTMLLinkElement).rel === "prefetch" ||
                (e.hasAttribute("as") && e.getAttribute("as").toLowerCase() === "script")) {
                // strip preloaded script
                return;
            }
        }
        return this.createElementNode(e);
    }
    public getTextNode(n: Node): IRewriteDOMNodeData | undefined {
        return this.createTextNode(n);
    }

    protected createElementNode(e: Element): IRewriteDOMNodeData {
        return new RewriteDOMElementData(e, this);
    }
    protected createTextNode(n: Node): IRewriteDOMNodeData {
        return new RewriteDOMTextNodeData(n);
    }

    protected isFiltered(e: Element) {
        const tagName = e.tagName.toUpperCase();
        if (tagName === "SCRIPT" || tagName === "NOSCRIPT") {
            // strip all script
            return true;
        }
        return false;
    }
}

export class RewriteDOMTextNodeData implements IRewriteDOMNodeData {
    protected node: Node;
    constructor(n: Node) {
        this.node = n;
    }
    public getHTML(): string {
        return this.getTextContent();
    }
    public getJSON() {
        return {
            textContent: this.getTextContent(),
        };
    }
    public getMap(mapWrapperFactory: IMapWrapperFactory): IMapWrapper {
        const map = mapWrapperFactory.createMap();
        map.set("textContent", this.getTextContent());
        return map;
    }
    protected getTextContent() {
        if (this.node.parentElement.tagName.toUpperCase() === "STYLE") {
            return HTMLUtil.patchStyleUrl(this.node.textContent);
        }
        return this.node.textContent;
    }
}

export class RewriteDOMElementData implements IRewriteDOMNodeData {
    protected element: Element;
    private children: IRewriteDOMNodeData[];
    constructor(e: Element, tree: IRewriteDOMTree) {
        this.element = e;
        this.initializeChildren(tree);
    }

    public getHTML(): string {
        const tagName = this.getTagName();
        let outStr = "<" + tagName;

        this.forEachOriginalNodeAttribute((key: string, value: string) => {
            outStr += " " + key + "=\"" + HTMLUtil.htmlEncode(value) + "\"";
        });
        if (this.isVoidElement()) {
            return outStr + "/>";
        }
        outStr += ">";
        this.forEachOriginalNodeChild((child: IRewriteDOMNodeData) => {
            outStr += child.getHTML();
        });
        return outStr + "</" + tagName + ">";
    }

    public getJSON(): object {
        const currAttributes = {};
        this.forEachOriginalNodeAttribute((key: string, value: string) => {
            currAttributes[key] = value;
        });

        const currChildren = [];
        this.forEachOriginalNodeChild((child: IRewriteDOMNodeData) => {
            currChildren.push(child.getJSON());
        });

        const obj: any = {};
        obj.tagName = this.getTagName();
        if (this.needExplicitNS()) {
            obj.namespaceURI = this.element.namespaceURI;
        }
        obj.attributes = currAttributes;
        obj.children = currChildren;
        return obj;
    }

    public getMap(mapWrapperFactory: IMapWrapperFactory): IMapWrapper {

        // TODO: Dynamic CSS rules added via CSSStyleSheet.insertRule doesn't get reflect in the DOM
        // And Mutation observer will not notify if it got change.  So we will miss those currently

        // TODO: Iframe content is not recorded.  It is also inaccessable if it is cross-origin

        const map = mapWrapperFactory.createMap();
        map.set("tagName", this.getTagName());

        if (this.needExplicitNS()) {
            map.set("namespaceURI", this.element.namespaceURI);
        }
        const attributes = mapWrapperFactory.createMap();
        this.forEachOriginalNodeAttribute((key: string, value: string) => {
            attributes.set(key, value);
        });
        map.setMap("attributes", attributes);

        const children = mapWrapperFactory.createMap();
        let childrenIndex = 0;
        this.forEachOriginalNodeChild((child: IRewriteDOMNodeData) => {
            children.setMap((childrenIndex++).toString(), child.getMap(mapWrapperFactory));
        });
        children.set("length", childrenIndex);

        map.setMap("children", children);
        return map;
    }

    protected initializeChildren(tree: IRewriteDOMTree): void {
        this.children = [];

        let curr: Node = this.element.firstChild;
        while (curr) {
            let newNode;
            switch (curr.nodeType) {
                case 1: // ELEMENT_NODE
                    newNode = tree.getElementNode(curr as Element);
                    break;
                case 3: // TEXT_NODE
                    newNode = tree.getTextNode(curr);
                    break;
                case 8:
                    // Don't care about comments
                    break;
                default:
                    console.error("Unexpected node type: ", curr.nodeType);
                    break;
            }
            if (newNode) { this.children.push(newNode); }
            curr = curr.nextSibling;
        }
    }
    protected getTagName(): string {
        return this.element.tagName;
    }
    protected needExplicitNS(): boolean {
        return this.element.namespaceURI && this.element.namespaceURI !== "http://www.w3.org/1999/xhtml";
    }
    protected patchAttribute(tagName: string, key: string, value: string, prepatched: boolean): string | null {
        if (!value) { return value; }
        const name = key.toLowerCase();
        if (name.startsWith("on")) {
            // strip event handlers
            return null;
        }
        if (name === "style") {
            return HTMLUtil.patchStyleUrl(value);
        }
        switch (tagName) {
            case "use":
                if (name === "xlink:href") {
                    value = this.patchPath(value);
                }
                break;
            case "A":
                if (name === "href") {
                    if (prepatched) {
                        return null;
                    }
                    return "javascript:void(0)";
                }
            case "LINK":
                if (name === "href") {
                    if (prepatched) {
                        return null;
                    }
                    return (this.element as HTMLLinkElement).href;
                }
                break;
            case "VIDEO":
                if (name === "src") {
                    value = this.patchPath(value);
                }
                break;
            case "IMG":
                if (name === "src") {
                    if (prepatched) {
                        return null;
                    }
                    return (this.element as HTMLImageElement).src;
                }
                if (name === "srcset") {
                    const srcset = value.split(",");
                    for (let i = 0; i < srcset.length; i++) {
                        srcset[i] = this.patchPath(srcset[i].trimLeft());
                    }

                    value = srcset.join(",");
                }
                break;
            case "IFRAME":
                if (name === "src") {
                    return null;
                }
                break;
            case "FORM":
                if (name === "action") {
                    return null;
                }
                break;
        }

        return value;
    }
    protected forEachOriginalNodeAttribute(func: (key: string, value: string) => void): void {
        const tagName = this.getTagName();
        switch (tagName) {
            case "A":
                // disable all links
                func("href", "javascript:void(0)");
                break;
            case "IMG":
                // Always use the live src
                const src = (this.element as HTMLImageElement).src;
                if (src) {
                    func("src", (this.element as HTMLImageElement).src);
                }
                break;
            case "LINK":
                // Always use the live href
                func("href", (this.element as HTMLLinkElement).href);
                break;
            case "FORM":
                func("action", "javascript:void(0)");
                break;
        }
        const attrs = this.element.attributes;
        if (attrs) {
            for (const attr of attrs) {
                const value = this.patchAttribute(tagName, attr.name, attr.value, true);
                if (value != null) {
                    func(attr.name, value);
                }
            }
        }
    }

    protected forEachOriginalNodeChild(func: (child: IRewriteDOMNodeData) => void): void {
        for (const i of this.children) {
            func(i);
        }
    }

    private isVoidElement(): boolean {
        switch (this.getTagName()) {
            case "AREA":
            case "BASE":
            case "BR":
            case "COL":
            case "COMMAND":
            case "EMBED":
            case "HR":
            case "IMG":
            case "INPUT":
            case "KEYGEN":
            case "LINK":
            case "MENUITEM":
            case "META":
            case "PARAM":
            case "SOURCE":
            case "TRACK":
            case "WBR":
                return true;
        }
        return false;
    }
    private patchPath(value: string) {
        // TODO: Do URL path patching property
        if (value.startsWith("//")) {
            return;
        } else if (value.startsWith("/")) {
            return HTMLUtil.getOrigin() + value;
        } else if (value.indexOf("://") === -1) {
            return HTMLUtil.getOrigin() + HTMLUtil.getPath() + value;
        }
        return value;
    }
}
