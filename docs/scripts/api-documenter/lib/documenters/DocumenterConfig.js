"use strict";
// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const node_core_library_1 = require("@rushstack/node-core-library");
/**
 * Helper for loading the api-documenter.json file format.  Later when the schema is more mature,
 * this class will be used to represent the validated and normalized configuration, whereas `IConfigFile`
 * represents the raw JSON file structure.
 */
class DocumenterConfig {
    constructor(filePath, configFile) {
        this.configFilePath = filePath;
        this.configFile = configFile;
        switch (configFile.newlineKind) {
            case 'lf':
                this.newlineKind = "\n" /* Lf */;
                break;
            case 'os':
                this.newlineKind = "os" /* OsDefault */;
                break;
            default:
                this.newlineKind = "\r\n" /* CrLf */;
                break;
        }
    }
    /**
     * Load and validate an api-documenter.json file.
     */
    static loadFile(configFilePath) {
        const configFile = node_core_library_1.JsonFile.loadAndValidate(configFilePath, DocumenterConfig.jsonSchema);
        return new DocumenterConfig(path.resolve(configFilePath), configFile);
    }
}
/**
 * The JSON Schema for API Extractor config file (api-extractor.schema.json).
 */
DocumenterConfig.jsonSchema = node_core_library_1.JsonSchema.fromFile(path.join(__dirname, '..', 'schemas', 'api-documenter.schema.json'));
/**
 * The config file name "api-extractor.json".
 */
DocumenterConfig.FILENAME = 'api-documenter.json';
exports.DocumenterConfig = DocumenterConfig;
//# sourceMappingURL=DocumenterConfig.js.map