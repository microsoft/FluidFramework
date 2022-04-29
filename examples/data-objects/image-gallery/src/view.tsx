/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef } from "react";
import ImageGallery from "react-image-gallery";
import { ImageGalleryModel } from "./model";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "react-image-gallery/styles/css/image-gallery.css";
// eslint-disable-next-line import/no-unassigned-import
import "./Styles.css";

export interface IImageGalleryViewProps {
    imageGalleryModel: ImageGalleryModel;
}

export const ImageGalleryView: React.FC<IImageGalleryViewProps> = (props: IImageGalleryViewProps) => {
    const { imageGalleryModel } = props;

    // react-image-gallery raises the same event for a user-initiated slide as it does for a programmatic
    // (slideToIndex) slide.  This complicates understanding whether we should update the model in response,
    // so here we'll compare against the currentIndex to suppress echo in the op stream.
    // Using onBeforeSlide helps the model change come at a predictable time (onSlide would update the model
    // late, after the animation finishes and potentially missing more-recent model updates that have come in).
    // The downside is that onBeforeSlide only fires if !isTransitioning which is cleared via timer, so it seems
    // possible in some cases to miss some events (especially for multiple rapid changes if the tab is in the
    // background, which I suspect is exacerbated due to throttled timers).  Preferably we would be able to
    // detect whether the slide is user-initiated or programmatic, and also the programmatic invocation would
    // interrupt/restart the slide rather than be dropped entirely.
    const onBeforeSlideHandler = (index: number) => {
        const currentIndex = imageGalleryModel.getIndex();
        if (index !== currentIndex) {
            imageGalleryModel.setIndex(index);
        }
    };
    const imageGalleryRef = useRef<ImageGallery>(null);

    useEffect(() => {
        const slideToCurrentSlide = () => {
            if (imageGalleryRef.current !== null) {
                const currentIndex = imageGalleryModel.getIndex();
                imageGalleryRef.current.slideToIndex(currentIndex);
            }
        };
        // Update at least once, on load.
        slideToCurrentSlide();
        imageGalleryModel.on("slideChanged", slideToCurrentSlide);
        return () => {
            imageGalleryModel.off("slideChanged", slideToCurrentSlide);
        };
    }, [imageGalleryModel]);

    return (
        <ImageGallery
            ref={ imageGalleryRef }
            items={ imageGalleryModel.imageList }
            onBeforeSlide={ onBeforeSlideHandler }
            slideDuration={ 10 }
        />
    );
};
