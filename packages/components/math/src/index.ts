import { Component } from "@prague/app-component";
import { MapExtension } from "@prague/map";
import { MathView } from "./view";

export class Math extends Component {
    constructor() {
        super([[MapExtension.Type, new MapExtension()]]);
    }

    public async opened() {
        await this.connected;

        const maybeDiv = await this.platform.queryInterface<HTMLElement>("div");
        if (!maybeDiv) {
            throw new Error("No <div> provided");
        }

        const view = new MathView();
        view.attach(maybeDiv, {});
    }

    protected async create() { /* do nothing */ }
}
