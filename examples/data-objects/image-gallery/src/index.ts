/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ContainerViewRuntimeFactory,
} from "@fluid-example/example-utils";

import React from "react";

import { ImageGalleryInstantiationFactory, ImageGalleryModel } from "./model";
import { ImageGalleryView } from "./view";

const imageGalleryViewCallback = (imageGalleryModel: ImageGalleryModel) =>
    React.createElement(ImageGalleryView, { imageGalleryModel });

export const fluidExport =
    new ContainerViewRuntimeFactory<ImageGalleryModel>(ImageGalleryInstantiationFactory, imageGalleryViewCallback);
