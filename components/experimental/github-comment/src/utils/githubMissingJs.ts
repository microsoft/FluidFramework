/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Functions that have been taken from other files in the sources of
 * Github-served pages that provide additional functionality not present in the
 * HTML or CSS files.
 */

export function xn(e, t) {
    const n = e.querySelectorAll('[role="tablist"] [role="tab"]');
    const s = e.querySelectorAll('[role="tabpanel"]');
    const o = n[t];
    const r = s[t];

    // eslint-disable-next-line max-len
    if (e.dispatchEvent(new CustomEvent("tab-container-change", { bubbles: !0, cancelable: !0, detail: { relatedTarget: r } }))) {
        // eslint-disable-next-line no-shadow
        for (const e of n) {
            e.setAttribute("aria-selected", "false");
            e.setAttribute("tabindex", "-1");
        }
        // eslint-disable-next-line no-shadow
        for (const e of s) {
            e.hidden = !0;
            e.setAttribute("tabindex", "0");
            o.setAttribute("aria-selected", "true");
            o.removeAttribute("tabindex");
            o.focus();
            r.hidden = !1;
            e.dispatchEvent(new CustomEvent("tab-container-changed", { bubbles: !0, detail: { relatedTarget: r } }));
        }
    }
}

export function tabHandler(e) {
    const t = Array.from(document.querySelectorAll('[role="tablist"] [role="tab"]'));
    if (!(e.target instanceof Element)) {
        return;
    }
    const n = e.target.closest('[role="tab"]');
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    n && n.closest('[role="tablist"]') && xn(document, t.indexOf(n));
}
