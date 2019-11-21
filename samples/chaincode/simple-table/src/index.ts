import {
    SimpleModuleInstantiationFactory,
} from "@microsoft/fluid-aqueduct";

import { ReacttableInstantiationFactory as ComponentInstantiationFactory } from "./main";
import { TableDocument } from "@fluid-example/table-document";

// tslint:disable-next-line: no-var-requires no-require-imports
const pkg = require("../package.json");
const componentName = pkg.name as string;

export const TableDocType = "@fluid/TableDoc";

export const fluidExport = new SimpleModuleInstantiationFactory(
    componentName,
    new Map([
        [componentName, Promise.resolve(ComponentInstantiationFactory)],
        [TableDocType, Promise.resolve(TableDocument.getFactory())],
    ]),
);
