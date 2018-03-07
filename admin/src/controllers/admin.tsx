import * as React from "react";
import * as ReactDOM from "react-dom";

import { Content } from "./components/Content";

// TODO: Remove this and side from props.
const menus = {
    slide: {buttonText: 'Slide', items: 1},
    stack: {buttonText: 'Stack', items: 1},
    elastic: {buttonText: 'Elastic', items: 1},
    bubble: {buttonText: 'Bubble', items: 1},
    push: {buttonText: 'Push', items: 1},
    pushRotate: {buttonText: 'Push Rotate', items: 2},
    scaleDown: {buttonText: 'Scale Down', items: 2},
    scaleRotate: {buttonText: 'Scale Rotate', items: 2},
    fallDown: {buttonText: 'Fall Down', items: 2},
    reveal: {buttonText: 'Reveal', items: 1}
  };

export async function load(user: any) {
    $("document").ready(() => {
        console.log(user.displayName);
        ReactDOM.render(
            <Content menus={menus} side="left" />,
            document.getElementById("adminportal")
        );
    });
}
