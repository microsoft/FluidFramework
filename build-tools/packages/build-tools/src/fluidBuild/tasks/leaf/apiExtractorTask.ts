/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TscDependentTask } from "./tscTask";

export class ApiExtractorTask extends TscDependentTask {
    protected get doneFile() {
        // TODO: This assume there is only one api-extractor task per package
        return "api-extractor.done.build.log";
    }
    protected get configFileFullPath() {
        return this.getPackageFileFullPath("api-extractor.json");
    }
}
