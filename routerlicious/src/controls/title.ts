import * as ui from "../ui";

export class Title extends ui.Component {

    constructor(element: HTMLDivElement) {
        super(element);
        this.element.classList.add("title-bar");
    }

    public measure(size: ui.ISize): ui.ISize {
        return { width: size.width, height: 30 };
    }

    public setTitle(title: string) {
        this.element.innerHTML = `<span><b>${title}</b></span>`;
    }

    public setBackgroundColor(title: string) {
        this.element.style.backgroundColor = "#" + this.intToRGB(this.hashCode(title));
    }

    // Implementation of java String#hashCode
    private hashCode(str: string): number {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            /* tslint:disable:no-bitwise */
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return hash;
    }

    // Integer to RGB color converter.
    private intToRGB(code: number): string {
        /* tslint:disable:no-bitwise */
        let c = (code & 0x00FFFFFF).toString(16).toUpperCase();
        return "00000".substring(0, 6 - c.length) + c;
    }
}
