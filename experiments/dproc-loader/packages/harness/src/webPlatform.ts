import { IPlatform, IPlatformFactory } from "@prague/runtime-definitions";
import { EventEmitter } from "events";

class DefinitionGuide extends EventEmitter {
    private counter = 0;
    private dts: string = "";

    constructor() {
        super();

        setInterval(
            () => {
                let dts = "declare class Facts {\n";
                for (let i = 0; i < this.counter; i++) {
                    dts += `    static next${i}(): string;\n`;
                }
                dts += "}";
                this.dts = dts;

                this.counter++;

                this.emit("definitionsChanged");
            },
            5000);
    }

    public getDefinition(): string {
        return this.dts;
    }
}

export class WebPlatform extends EventEmitter implements IPlatform {
    private definitions = new DefinitionGuide();

    constructor(private div: HTMLElement) {
        super();
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "dom":
                return document;
            case "div":
                return this.div;
            case "dts":
                return this.definitions;
            default:
                return null;
        }
    }

    // Temporary measure to indicate the UI changed
    public update() {
        this.emit("update");
    }
}

export class WebPlatformFactory implements IPlatformFactory {
    constructor(private div: HTMLElement) {
    }

    public async create(): Promise<IPlatform> {
        return new WebPlatform(this.div);
    }
}
