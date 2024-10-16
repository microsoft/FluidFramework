import React from "react";
import "@site/src/css/TitleSection.css";
import BGImage from '@site/static/images/titleImage.png';

export function TitleSection(): React.ReactElement {
  return (
    <div className="container" >

        <img
          src={BGImage}
          alt="This is placeholder text for bg image"
          className="bgImage"
        />
        <div className="overlay"></div> {/* White overlay */}

      <div className="titleBox">
        <h3 className="title">Fluid Framework</h3>
        <span className="description">Empower collaborative innovation with Fluid Framework's seamless, high-performance tech stack for real-time applications.
        </span>
      </div>

    </div>
  )
}
