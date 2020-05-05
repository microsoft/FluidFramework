/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export default ({
    Vue, // the version of Vue being used in the VuePress app
    options, // the options for the root Vue instance
    router, // the router instance for the app
    siteData, // site metadata
    isServer // is this enhancement applied in server-rendering or client
}) => {
    if (isServer) {
        const vue_markdown = require("vue-markdown");
        // console.log("Enhancing app...");
        // Vue.use(vue_markdown);
        Vue.component(vue_markdown);
    }
};
