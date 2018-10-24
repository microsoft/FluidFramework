import * as pragueApi from "@prague/client-api";
import * as pragueMap from "@prague/map";

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
        // TODO: Do style URL patching properly
        const origin = HTMLUtil.getOrigin();
        const path = HTMLUtil.getPath();
        let outStr = str.replace(/url\(\//g, "url(" + origin + "/");
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

export interface IRewriteDOMNode {
    getHTML(): string;
    getJSON();
    getPragueMap(doc: pragueApi.Document): pragueMap.IMap;
}

export interface IRewriteDOMTree {
    getElementNode(e: Element): IRewriteDOMNode | undefined;
    getTextNode(n: Node): IRewriteDOMNode | undefined;
}

export class RewriteDOMTree implements IRewriteDOMTree {
    protected rootElement: IRewriteDOMNode;

    public initializeFromDocument(doc: Document) {
        this.rootElement = this.getElementNode(document.documentElement);
    }

    public getHTML(): string {
        return "<!DOCTYPE HTML>" + this.rootElement.getHTML();
    }

    public getJSONString(): string {
        return JSON.stringify(this.rootElement.getJSON());
    }

    public getPragueMap(collabDoc: pragueApi.Document): pragueMap.IMap {
        return this.rootElement.getPragueMap(collabDoc);
    }
    public getElementNode(e: Element): IRewriteDOMNode | undefined {
        const tagName = e.tagName.toUpperCase();
        if (tagName === "SCRIPT" || tagName === "NOSCRIPT") {
            // strip all script
            return;
        }
        if (tagName === "LINK") {
            if ((e as HTMLLinkElement).rel === "prefetch" ||
                (e.hasAttribute("as") && e.getAttribute("as").toLowerCase() === "script")) {
                // strip preloaded script
                return;
            }
        }
        return this.createElementNode(e);
    }
    public getTextNode(n: Node): IRewriteDOMNode | undefined {
        return this.createTextNode(n);
    }

    protected createElementNode(e: Element): IRewriteDOMNode {
        return new RewriteDOMElement(e, this);
    }
    protected createTextNode(n: Node): IRewriteDOMNode {
        return new RewriteDOMTextNode(n);
    }
}

export class RewriteDOMTextNode implements IRewriteDOMNode {
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
    public getPragueMap(collabDoc: pragueApi.Document): pragueMap.IMap {
        const map = collabDoc.createMap();
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

export class RewriteDOMElement implements IRewriteDOMNode {
    protected element: Element;
    private children: IRewriteDOMNode[];
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
        this.forEachOriginalNodeChild((child: IRewriteDOMNode) => {
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
        this.forEachOriginalNodeChild((child: IRewriteDOMNode) => {
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

    public getPragueMap(collabDoc: pragueApi.Document): pragueMap.IMap {

        // TODO: Dynamic CSS rules added via CSSStyleSheet.insertRule doesn't get reflect in the DOM
        // And Mutation observer will not notify if it got change.  So we will miss those currently

        // TODO: Iframe content is not recorded.  It is also inaccessable if it is cross-origin

        const map = collabDoc.createMap();
        map.set("tagName", this.getTagName());

        if (this.needExplicitNS()) {
            map.set("namespaceURI", this.element.namespaceURI);
        }
        const attributes = collabDoc.createMap();
        this.forEachOriginalNodeAttribute((key: string, value: string) => {
            attributes.set(key, value);
        });
        map.set("attributes", attributes);

        const children = collabDoc.createMap();
        let childrenIndex = 0;
        this.forEachOriginalNodeChild((child: IRewriteDOMNode) => {
            children.set((childrenIndex++).toString(), child.getPragueMap(collabDoc));
        });
        children.set("length", childrenIndex);

        map.set("children", children);
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
                default:
                    console.error("Unexpect node type: ", curr.nodeType);
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

    protected forEachOriginalNodeChild(func: (child: IRewriteDOMNode) => void): void {
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
            if (value.startsWith("/")) {
                return HTMLUtil.getOrigin() + value;
            }
        } else if (value.indexOf("://") === -1) {
            return HTMLUtil.getOrigin() + HTMLUtil.getPath() + value;
        }
        return value;
    }
}
