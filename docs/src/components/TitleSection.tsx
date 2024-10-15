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
    </div>
  )
}
