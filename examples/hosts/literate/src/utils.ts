/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponent } from "@microsoft/fluid-component-core-interfaces";
import { IFluidCodeDetails } from "@microsoft/fluid-container-definitions";
import { Container, Loader } from "@microsoft/fluid-container-loader";
import { parse } from "querystring";

/**
 * The initializeComponent method takes in a document and a desired NPM package and establishes a code quorum
 * on this package.
 */
export async function initializeComponent(document: Container, pkg: IFluidCodeDetails): Promise<void> {
    if (!pkg) {
        return;
    }

    const quorum = document.getQuorum();

    // Wait for connection so that proposals can be sent
    if (!document.connected) {
        await new Promise<void>((resolve) => document.on("connected", () => resolve()));
    }

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has("code")) {
        await quorum.propose("code", pkg);
    }

    console.log(`Code is ${quorum.get("code")}`);
}

/**
 * attachCore is used to make a request against the loader to load a prague component. And then attaches to it once
 * found.
 */
async function attachCore(loader: Loader, url: string, div: HTMLDivElement) {
    const response = await loader.request({ url });

    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        return;
    }

    // Check if the component is viewable
    const component = response.value as IComponent;
    const viewable = component.IComponentHTMLVisual;
    if (!viewable) {
        return;
    }

    const renderable = viewable.addView ? viewable.addView() : viewable;
    renderable.render(div, { display: "block" });
}

/**
 * attach is used to allow a host to attach to a Prague URL. Given that we may be establishing a new set of code
 * on the document it listens for the "contextChanged" event which fires when a new code value is quorumed on. In this
 * case it simply runs the attach method again.
 */
export async function attach(loader: Loader, container: Container, url: string, div: HTMLDivElement) {
    attachCore(loader, url, div);
    container.on("contextChanged", () => {
        attachCore(loader, url, div);
    });
}

export function parsePackageName(url: Location, defaultPkg: string): string {
    const parsed = parse(url.search.substr(1));
    return parsed.component ? parsed.component as string : defaultPkg;
}
