import { FlowDocument } from "@chaincode/flow-document";
import { FlowEditor } from "@chaincode/flow-editor";
import { Component } from "@prague/app-component";
import {
    IContainerContext,
    IRuntime,
} from "@prague/container-definitions";
import { Scheduler } from "../../flow-util/dist";
import { HostView } from "./host";
import { importDoc } from "./template";

export class FlowHost extends Component {
    public static readonly type = "@chaincode/flow-host2";

    protected async create() {
        this.runtime.createAndAttachComponent(this.docId, FlowDocument.type);

        const url = new URL(window.location.href);
        const template = url.searchParams.get("template");
        if (template) {
            importDoc(
                this.runtime.openComponent(this.docId, /* wait: */ true),
                template,
            );
        }
    }

    protected async opened() {
        const docP = this.runtime.openComponent<FlowDocument>(this.docId, /* wait: */ true);
        const div = await this.platform.queryInterface<Element>("div");

        const scheduler = new Scheduler();
        const viewport = new HostView();
        viewport.attach(div, { scheduler, doc: await docP });
    }

    private get docId() { return `${this.id}-doc`; }
}

/**
 * Instantiates a new chaincode host
 */
export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(
        context,
        FlowHost.type,
        new Map([
            [FlowHost.type, Promise.resolve(Component.createComponentFactory(FlowHost))],
            [FlowDocument.type, Promise.resolve(Component.createComponentFactory(FlowDocument))],
            [FlowEditor.type, Promise.resolve(Component.createComponentFactory(FlowEditor))],
            ["@chaincode/math", import("@chaincode/math").then((module) => Component.createComponentFactory(module.Math))],
        ]));
}
