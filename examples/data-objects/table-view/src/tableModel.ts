/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SharedMatrix } from "@fluidframework/matrix";
import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { IFluidHandle } from "@fluidframework/core-interfaces";

export const tableModelType = "@fluid-example/table-view";

const matrixKey = "matrixKey";

export class TableModel extends DataObject {
    public static getFactory() { return factory; }

    private _tableMatrix: SharedMatrix | undefined;
    public get tableMatrix() {
        if (this._tableMatrix === undefined) {
            throw new Error("Table matrix not fully initialized");
        }
        return this._tableMatrix;
    }

    protected async initializingFirstTime() {
        const matrix = SharedMatrix.create(this.runtime);
        this.root.set(matrixKey, matrix.handle);
        matrix.insertRows(0, 5);
        matrix.insertCols(0, 8);
    }

    protected async hasInitialized(): Promise<void> {
        this._tableMatrix = await this.root.get<IFluidHandle<SharedMatrix>>(matrixKey)?.get();
    }
}

const factory = new DataObjectFactory(
    tableModelType,
    TableModel,
    [
        SharedMatrix.getFactory(),
    ],
    {});
