/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableDocumentType } from "@chaincode/table-document";
import { SimpleModuleInstantiationFactory } from "@prague/aqueduct";

export const tableViewType = "@chaincode/table-view";

export const fluidExport = new SimpleModuleInstantiationFactory(
    tableViewType,
    new Map([
        [tableViewType, import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableview").then((m) => m.TableView.getFactory())],
        [TableDocumentType, import(/* webpackChunkName: "table-document", webpackPreload: true */ "@chaincode/table-document").then((m) => m.TableDocument.getFactory())],
    ]),
);
