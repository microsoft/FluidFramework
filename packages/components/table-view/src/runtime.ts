/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TableDocumentType } from "@fluid-example/table-document";
import { SimpleModuleInstantiationFactory } from "@microsoft/fluid-aqueduct";

export const tableViewType = "@fluid-example/table-view";

export const fluidExport = new SimpleModuleInstantiationFactory(
    tableViewType,
    new Map([
        // eslint-disable-next-line max-len
        [tableViewType, import(/* webpackChunkName: "table-view", webpackPreload: true */ "./tableview").then((m) => m.TableView.getFactory())],
        // eslint-disable-next-line max-len
        [TableDocumentType, import(/* webpackChunkName: "table-document", webpackPreload: true */ "@fluid-example/table-document").then((m) => m.TableDocument.getFactory())],
    ]),
);
