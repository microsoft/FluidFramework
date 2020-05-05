/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as styles from "../editor/index.css";

export function ownsNode(root: HTMLElement, node: Node | HTMLElement) {
    while (node !== null && node !== root) {
        if ("classList" in node && node.classList.contains(styles.inclusion)) {
            return false;
        }
        node = node.parentElement;
    }
    return node === root;
}
