interface ICursorTransition {
    suffix: string;
    property: string;
    fn: (element: Element) => Element | null;
}

class Cursor {
    private static readonly first    = { suffix: "f", property: "firstElementChild",       fn: (element: Element) => element.firstElementChild };
    private static readonly last     = { suffix: "l", property: "lastElementChild",        fn: (element: Element) => element.lastElementChild };
    private static readonly next     = { suffix: "n", property: "nextElementSibling",      fn: (element: Element) => element.nextElementSibling };
    private static readonly previous = { suffix: "p", property: "previousElementSibling",  fn: (element: Element) => element.previousElementSibling };

    public readonly pathFns = new Map<string, (element: Element) => Element>();
    private element: Element | null = null;
    private path: string = "";
    private pathName: string = "";

    constructor () { }

    public start(root: Element) {
        this.path = "return root";
        this.pathName = "";
        this.element = root;
    }

    private moveTo(transition: ICursorTransition) {
        this.path += `.${transition.property}`;
        this.pathName += transition.suffix;
        this.element = transition.fn(this.element!);
    }

    public first()      { this.moveTo(Cursor.first); }
    public last()       { this.moveTo(Cursor.last); }
    public next()       { this.moveTo(Cursor.next); }
    public previous()   { this.moveTo(Cursor.previous); }
    
    public child(index: number) {
        // Calculate the distance to the child from the last child.
        let delta = this.element!.childElementCount - index;

        if (index < delta) {
            this.first();
            while (index-- > 0) {
                this.next();
            }
        } else {
            this.last();
            while (--delta > 0) {
                this.previous();
            }
        }
    }

    public end() {
        let pathFn = this.pathFns.get(this.pathName);
        if (!pathFn) {
            pathFn = new Function('root', this.path) as (element: Element) => Element;
            this.pathFns.set(this.pathName, pathFn);
        }
        return pathFn;
    }
}

export interface TemplateNode {
    tag: string;
    classList?: string[];
    props?: {};
    children?: TemplateNode[];
    ref?: string;
}

export class Template {
    private static readonly cursor = new Cursor();
    
    private readonly content: Element;
    private readonly refs = new Map<string, (root: Element) => Element>(); 
    
    constructor (content: TemplateNode) {
        const refToPath = new Map<string, number[]>();
        this.content = Template.build(content, [], refToPath);

        const cursor = Template.cursor;
        const refs = this.refs;
        for (const [ref, path] of refToPath) {
            cursor.start(this.content);
            for (const index of path) {
                cursor.child(index);
            }
            refs.set(ref, cursor.end());
        }
    }

    public get(root: Element, name: string) {
        return this.refs.get(name)!(root);
    }

    private static build(vnode: TemplateNode, path: number[], refs: Map<string, number[]>): Element {
        // Create the HTML element and assign all properties.
        const element = Object.assign(
            document.createElement(vnode.tag),
            vnode.props);
        
        // Copy CSS classes to classList.
        if (vnode.classList) {
            element.classList.add(...vnode.classList);
        }
    
        // Recursively build children (if any).
        if (vnode.children) {
            const level = path.length;
            path.push(0);
            for (const child of vnode.children) {
                element.appendChild(Template.build(child, path, refs));
                path[level]++;
            }
            path.pop();
        }

        if (vnode.ref) {
            refs.set(vnode.ref, path.slice(0));
        }
        
        return element;
    }

    public clone() {
        return document.importNode(this.content, /* deep: */ true);
    }
}
