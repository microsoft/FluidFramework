/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

export class DefinitionGuide extends EventEmitter {
    private dts: string = "";
    private readonly components = new Map<string, { root: { entry: any; type: string }; dts: string }>();
    private value: any;

    constructor() {
        super();
    }

    public getDefinition(): string {
        return this.dts;
    }

    public getValue(): any {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return this.value;
    }

    public async addComponent(id: string, platform) {
        const rootP = platform ? platform.queryInterface("root") : Promise.resolve(null);
        const dtsP = platform ? platform.queryInterface("dts") : Promise.resolve(null);
        const [root, dts] = await Promise.all([rootP, dtsP]);
        const details: any = { root, dts };

        this.components.set(id, details);
        this.generateDts();
    }

    private generateDts() {
        let dts = "";
        const value = {} as any;

        for (const component of this.components) {
            if (component[1].dts) {
                dts += component[1].dts;
                dts += "\n";
            }
        }

        dts += "declare interface IFluids {\n";
        for (const component of this.components) {
            const type = component[1].root ? component[1].root.type : "any";
            dts += `    ${component[0]}: ${type}\n`;
            value[component[0]] = component[1].root ? component[1].root.entry : null;
        }
        dts += "}\n";
        dts += "declare var host: IFluids\n";

        this.dts = dts;
        this.value = value;

        this.emit("definitionsChanged");
    }
}

export const definitionGuide = new DefinitionGuide();
