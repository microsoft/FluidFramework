import { Component } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { TableDocument } from "./document";
import { TableSlice } from "./slice";

export { TableDocument, TableSlice };

// tslint:disable-next-line:no-var-requires
const pkg = require("../package.json");

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, pkg.name, [
        [pkg.name, TableDocument],
        ["@chaincode/table-slice", TableSlice],
    ]);
}
