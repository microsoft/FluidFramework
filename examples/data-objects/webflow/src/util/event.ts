/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as styles from "../editor/index.css";

export function ownsNode(root: HTMLElement, node: Node | HTMLElement) {
    let _node = node;
    while (_node !== null && _node !== root) {
        if ("classList" in _node && _node.classList.contains(styles.inclusion)) {
            return false;
        }
        _node = _node.parentElement;
    }
    return _node === root;
}
