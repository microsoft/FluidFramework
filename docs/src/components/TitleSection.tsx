/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import React from "react";
import "@site/src/css/titleSection.css";

export function TitleSection(): React.ReactElement {
  return (
    <div className="rootContainer">
      <div className="titleSectionContainer" >{/*contains bg image */}
        <div className="overlay"></div> {/* White overlay */}
          <div className="contentContainer">
            <div className="titleBox">
              <h3 className="title">Fluid Framework</h3>
              <span className="description">Empower collaborative innovation with Fluid Framework's seamless, high-performance tech stack for real-time applications.
              </span>
            </div>
            <div className="videoContainer">
              <div className="roundedVideo">
                <iframe width="100%" height="100%"  src="https://www.youtube.com/embed/uL2nMYk6WTQ" title="Fluid Framework 2.0 Beta - Build collaborative apps fast!"  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
              </div>
            </div>
          </div>
      </div>
    </div>
  )
}
