/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerViewRuntimeFactory,
} from "@fluid-example/example-utils";

import React from "react";

import { ImageGalleryInstantiationFactory, ImageGalleryObject } from "./model";
import { ImageGalleryView } from "./view";

const imageGalleryViewCallback = (imageGalleryObject: ImageGalleryObject) =>
    <ImageGalleryView imageGalleryObject={ imageGalleryObject } />;

export const fluidExport =
    new ContainerViewRuntimeFactory<ImageGalleryObject>(ImageGalleryInstantiationFactory, imageGalleryViewCallback);
