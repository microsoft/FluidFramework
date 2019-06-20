/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentHTMLViewable,
    IPlatform,
} from "@prague/container-definitions";
import { Container, Loader } from "@prague/container-loader";
import { IComponent as ILegacyComponent } from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { parse } from "querystring";

export async function initializeChaincode(document: Container, pkg: string): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        // tslint:disable-next-line: no-unnecessary-callback-wrapper no-void-expression
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code2")) {
        await quorum.propose("code2", pkg);
    }

    console.log(`Code is ${quorum.get("code2")}`);
}

async function attach(loader: Loader, url: string, host: Host) {
    const response = await loader.request({ url });

    if (response.status !== 200 || response.mimeType !== "prague/component") {
        return;
    }

    // TODO included for back compat - can remove once we migrate to 0.5
    // tslint:disable-next-line: no-unsafe-any
    if ("attach" in response.value) {
        const legacy = response.value as ILegacyComponent;
        legacy.attach(new Platform(host.div));
        return;
    }

    // Check if the component is viewable
    const component = response.value as IComponent;
    const viewable = component.query<IComponentHTMLViewable>("IComponentHTMLViewable");
    if (!viewable) {
        return;
    }

    // Attach our div to the host
    viewable.addView(host, host.div);
}

export async function registerAttach(loader: Loader, container: Container, uri: string, host: Host) {
    attach(loader, uri, host);
    container.on("contextChanged", (value) => {
        attach(loader, uri, host);
    });
}

export function parsePackageName(url: Location, defaultPkg: string): string {
    const parsed = parse(url.search.substr(1));
    return parsed.chaincode ? parsed.chaincode as string : defaultPkg;
}

export class Host implements IComponent {
    constructor(public readonly div: HTMLElement) {
    }

    public query<T>(id: string): T {
        return undefined;
    }

    public list(): string[] {
        return [];
    }
}

class Platform extends EventEmitter implements IPlatform {
    constructor(private readonly div: HTMLElement) {
        super();
    }

    public async queryInterface<T>(id: string): Promise<any> {
        switch (id) {
            case "dom":
                return document;
            case "div":
                return this.div;
            default:
                return null;
        }
    }

    public detach() {
        return;
    }
}
