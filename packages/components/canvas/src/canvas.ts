/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { PrimedComponent } from "@prague/aqueduct";
import * as api from "@prague/client-api";
import { controls, ui } from "@prague/client-ui";
import {
    IComponentHTMLOptions,
    IComponentHTMLView,
    IComponentHTMLVisual,
} from "@prague/component-core-interfaces";
import { ComponentRuntime } from "@prague/component-runtime";
import { ISharedMap } from "@prague/map";
import { IComponentRuntime } from "@prague/runtime-definitions";
import { Stream } from "@prague/stream";
import "./style.less";

// tslint:disable:no-console
class CanvasView implements IComponentHTMLView {
    public static supportedInterfaces = ["IComponentHTMLRender", "IComponentHTMLView"];

    public get IComponentHTMLView() { return this; }
    public get IComponentHTMLRender() { return this; }

    public static create(
        runtime: IComponentRuntime,
        root: ISharedMap,
    ): CanvasView {
        const browserHost = new ui.BrowserContainerHost();

        const canvas = new controls.FlexView(
            document.createElement("div"),
            new api.Document(runtime as ComponentRuntime, null, root),
            root,
        );
        browserHost.attach(canvas);

        return new CanvasView();
    }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        // TODO
        return;
    }

    public remove(): void {
        // TODO need way to detach rendering
        return;
    }
}

export class Canvas extends PrimedComponent implements IComponentHTMLVisual {
    public get IComponentHTMLVisual() { return this; }
    public get IComponentHTMLRender() { return this; }

    public render(elm: HTMLElement, options?: IComponentHTMLOptions): void {
        CanvasView.create(this.runtime, this.root).render(elm, options);
    }

    protected async componentInitializingFirstTime() {
        this.root.set("ink", Stream.create(this.runtime));
    }

    protected async componentInitializingFromExisting() {
        // Wait here for the ink - otherwise flexView will try to root.get it before it exists if there hasn't been
        // a summary op yet.  Probably flexView should wait instead.
        await this.root.wait("ink");
    }
}
