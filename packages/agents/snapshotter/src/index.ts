/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerRuntime } from "@microsoft/fluid-container-runtime";
import { Snapshotter } from "./snapshotter";

export function run(runtime: ContainerRuntime) {
    const snapshotter = new Snapshotter(runtime);
    snapshotter.start();
}
