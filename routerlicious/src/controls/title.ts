import * as ui from "../ui";

export class Title extends ui.Component {

    constructor(element: HTMLDivElement) {
        super(element);
        this.element.classList.add("title-bar");
    }

    public measure(size: ui.ISize): ui.ISize {
        return { width: size.width, height: 40 };
    }

    public setTitle(title: string) {
        this.element.innerHTML = `<span style="font-size:20px;font-family:Book Antiqua">${title}</span>`;
    }

    public setBackgroundColor(title: string) {
        const rgb = this.hexToRGB(this.intToHex(this.hashCode(title)));
        const gradient = `linear-gradient(to right, rgba(${rgb[0]},${rgb[1]},${rgb[2]},0),
                          rgba(${rgb[0]},${rgb[1]},${rgb[2]},1))`;
        this.element.style.background = gradient;
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
    private intToHex(code: number): string {
        /* tslint:disable:no-bitwise */
        let c = (code & 0x00FFFFFF).toString(16).toUpperCase();
        return "00000".substring(0, 6 - c.length) + c;
    }

    private hexToRGB(hex: string): number[] {
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        let num = parseInt(hex, 16);
        return [num >> 16, num >> 8 & 255, num & 255];
    }
}
