/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React, { useEffect, useRef, useState } from "react";
import ImageGallery from "react-image-gallery";
import { ImageGalleryObject } from "./model";
// eslint-disable-next-line import/no-internal-modules, import/no-unassigned-import
import "react-image-gallery/styles/css/image-gallery.css";
// eslint-disable-next-line import/no-unassigned-import
import "./Styles.css";

export interface IImageGalleryViewProps {
    imageGalleryObject: ImageGalleryObject;
}

export const ImageGalleryView: React.FC<IImageGalleryViewProps> = (props: IImageGalleryViewProps) => {
    const { imageGalleryObject } = props;

    // By default, we're waiting for the local user to manipulate the slides.  If they do, then we'll set
    // the new slide index into the Fluid data object to transmit to remote clients.
    // When we hear a remote transmission come in, we want to programmatically slide to the new value but
    // we don't want to retrigger this logic and rebroadcast that same value back out.  To achieve this,
    // we will temporarily disable modification of the Fluid data object in response to the slide and
    // only resume it after a single onSlide callback (the onSlide that was triggered by our programmatic
    // slide).
    const handleLocalSlide = (index: number | undefined) => {
        console.log("handlelocal", index);
        if (index !== undefined) {
            imageGalleryObject.setPosition(index);
        }
    };
    const [onSlideCallback, setOnSlideCallback] = useState<(index: number | undefined) => void>(handleLocalSlide);
    const resumeHandlingLocalSlide = () => {
        console.log("setting to local");
        setOnSlideCallback(handleLocalSlide);
    };

    // eslint-disable-next-line no-null/no-null
    const imageGalleryRef = useRef<ImageGallery>(null);

    useEffect(() => {
        const handleSlideChanged = () => {
            // eslint-disable-next-line no-null/no-null
            if (imageGalleryRef.current !== null) {
                const index = imageGalleryObject.getPosition();
                console.log("current", imageGalleryRef.current.getCurrentIndex());
                if (imageGalleryRef.current.getCurrentIndex() === index) {
                    return;
                }
                // We're about to induce a slide from the remote change -- disable onSlide handling for a
                // single callback and then resume.
                console.log("setting to resume after 1");
                setOnSlideCallback(resumeHandlingLocalSlide);
                console.log("handling", index);
                imageGalleryRef.current.slideToIndex(index);
            }
        };
        // Run once to set the initial slide on load
        handleSlideChanged();
        imageGalleryObject.on("slideChanged", handleSlideChanged);
        return () => {
            imageGalleryObject.off("slideChanged", handleSlideChanged);
        };
    }, [ imageGalleryObject ]);

    return (
        <ImageGallery
            ref={ imageGalleryRef }
            items={ imageGalleryObject.imageList }
            onSlide={ onSlideCallback }
            slideDuration={ 10 }
        />
    );
};
