import { Component } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";
import { TableDocument } from "./document";
import { chaincodePackage } from "./pkg";
import { TableSlice } from "./slice";
import { ITable } from "./table";

export { TableDocument, TableSlice, ITable, chaincodePackage };

export async function instantiateRuntime(context: IContainerContext): Promise<IRuntime> {
    return Component.instantiateRuntime(context, chaincodePackage, [
        [chaincodePackage, Promise.resolve(TableDocument)],
        [TableSlice.type, Promise.resolve(TableSlice)],
    ]);
}
