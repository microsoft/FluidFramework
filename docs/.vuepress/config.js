/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");

const listPages = (dirPath, includeIndex = false) => {
    dirPath = path.join(__dirname, dirPath);
    const files = fs.readdirSync(dirPath);
    let pages = [];
    for (let file of files) {
        if (file === "README.md" || file == "index.md") {
            if (!includeIndex) {
                continue;
            }
        }
        file = path.basename(file, ".md");
        pages.push(file);
    }
    return pages;
};

const getNav = () => {
    return [
        { text: "What is Fluid?", link: "/what-is-fluid" },
        { text: "Guide", link: "/guide/" },
        { text: "Tutorials", link: "/examples/" },
        { text: "Patterns", link: "/patterns/" },
        { text: "API", link: "/api/overview" },
        {
            text: "🤿 Dive Deeper",
            items: [
                { text: "How Fluid works", link: "/how/" },
                { text: "Big page of docs and decks", link: "/misc/doc-index" },
                { text: "FAQ", link: "/faq/" },
                { text: "Terminology", link: "/misc/terminology" },
                { text: "Concepts", link: "/misc/concepts" },
                {
                    text: "Contributing",
                    items: [
                        { text: "Coding guidelines", link: "/contributing/coding-guidelines" },
                        { text: "Building documentation locally", link: "/contributing/building-documentation" },
                        { text: "Routerlicious build machine", link: "/contributing/r11s-build-machine" },
                        { text: "Compatibility", link: "/contributing/compatibility" },
                        { text: "Miscellaneous", link: "/contributing/misc" },
                    ]
                },
                { text: "Team", link: "/team/" }
            ]
        },
    ];
}

/**
 * The API docs are built separately from the core docs, and if the API files aren't present but are linked in a
 * sidebar, there's a build error. This function only adds API sidebar items if the files are present. This allows local
 * builds without the API documentation - which is much faster when doing local testing.
 */
const getApiSidebar = () => {
    const directoryPath = path.join(__dirname, "../api");
    const files = fs.readdirSync(directoryPath);

    let apiSidebar = [{
        title: "API Overview",
        path: "overview",
        collapsable: false,
        sidebarDepth: 0
    }];

    if (files.includes("fluid-aqueduct.md")) {
        apiSidebar.push({
            title: "Framework",
            sidebarDepth: 2,
            children: [
                "fluid-aqueduct",
                "fluid-aqueduct-react",
                "fluid-component-core-interfaces",
                "fluid-framework-interfaces",
                "fluid-undo-redo",
            ]
        });
    }

    if (files.includes("fluid-cell.md")) {
        apiSidebar.push({
            title: "Distributed Data Structures",
            children: [
                "fluid-cell",
                "fluid-ink",
                "fluid-map",
                "fluid-ordered-collection",
                "fluid-register-collection",
                "fluid-sequence",
                "fluid-shared-object-base",
            ]
        });
    }

    if (files.includes("fluid-component-runtime.md")) {
        apiSidebar.push({
            title: "Runtime",
            children: [
                "fluid-component-runtime",
                "fluid-container-runtime",
                "fluid-runtime-definitions",
            ]
        });
    }

    if (files.includes("fluid-container-loader.md")) {
        apiSidebar.push({
            title: "Loader",
            children: [
                "fluid-container-definitions",
                "fluid-container-loader",
                "fluid-execution-context-loader",
                "fluid-web-code-loader",
            ]
        });
    }

    if (files.includes("fluid-driver-base.md")) {
        apiSidebar.push({
            title: "Driver",
            children: [
                "fluid-driver-base",
                "fluid-driver-definitions",
                "fluid-file-driver",
                "fluid-iframe-driver",
                "fluid-odsp-driver",
                "fluid-replay-driver",
                "fluid-routerlicious-driver",
            ]
        });
    }

    if (files.includes("fluid-base-host.md")) {
        apiSidebar.push({
            title: "Sample Hosts",
            children: [
                "fluid-base-host",
                "react-web-host",
                "tiny-web-host",
            ]
        });
    }

    if (files.includes("fluid-debugger.md")) {
        apiSidebar.push({
            title: "Tools",
            children: [
                "fluid-debugger",
                "fluid-merge-tree-client-replay",
                "fluid-replay-tool",
            ]
        });
    }

    if (files.includes("fluid-core-utils.md")) {
        apiSidebar.push({
            title: "Miscellaneous",
            children: [
                "fluid-core-utils",
            ]
        });
    }

    if (files.includes("fluid-common-definitions.md")) {
        apiSidebar.push({
            title: "Internal/Deprecated",
            children: [
                "client-api",
                "fluid-common-definitions",
                "fluid-driver-utils",
                "fluid-host-service-interfaces",
                "fluid-runtime-utils",
            ]
        });
    }

    return apiSidebar;
};

const getGuideSidebar = () => {
    return [
        {
            title: "Guide",
            collapsable: false,
            children: [
                "",
                "yo-fluid",
                "water-park",
            ]
        },
        {
            title: "Distributed Data Structures",
            collapsable: false,
            path: "dds",
            children: [
                "SharedDirectory",
                "SharedMap",
                "SharedCell",
                {
                    title: "Sequences",
                    path: "sequences",
                    children: [
                        "SharedNumberSequence",
                        "SharedObjectSequence",
                        "SharedString",
                        "SparseMatrix",
                    ],
                },
                "consensus",
            ]
        },
        {
            title: "Component model",
            collapsable: false,
            children: [
                "components.md",
                "component-design-principles.md",
            ]
        },
        {
            title: "Advanced",
            collapsable: false,
            children: [
                "dds-anatomy",
                "container-and-component-loading",
            ]
        },
    ];
}

const getExamplesSidebar = () => {
    return [
        "",
        "dice-roller",
        "sudoku",
        "badge",
        {
            title: "Components",
            collapsable: true,
            children: [
                "visual-component",
                "data-component",
                "embed-components",
                "cross-component",
                "component-patterns",
                "component-collections",
                "bots",
                "component-best-practices",
            ]
        },
        {
            title: "Containers",
            collapsable: true,
            children: [
                "singletons",
            ]
        },
    ];
}

const getTeamSidebar = () => {
    return [
        {
            title: "Team",
            collapsable: false,
            children: [
                ""
            ]
        },
        {
            title: "Updates",
            collapsable: false,
            children: listPages("../team/")
        },
    ];
}

const getHowSidebar = () => {
    return [
        "",
        "tob",
        "developer-guide",
    ];
}

const getAdvancedSidebar = () => {
    return [
        "",
        "loading-deep-dive",
    ];
}

const getPatternsSidebar = () => {
    return [
        {
            title: "Patterns",
            collapsable: false,
            children: [
                "leader-election",
            ]
        },
    ];
}

module.exports = {
    title: "Fluid Framework",
    description: "State that flows",
    evergreen: true,
    head: [
        ["link", { rel: "icon", href: "/images/homescreen48.png" }],
        ["link", { rel: "manifest", crossorigin: "use-credentials", href: "/manifest.webmanifest" }],
        ["meta", { name: "theme-color", content: "#00BCF2" }],
        ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
        ["meta", { name: "apple-mobile-web-app-status-bar-style", content: "black" }],
        ["link", { rel: "apple-touch-icon", href: "/images/homescreen192.png" }],
        // ["link", { rel: "mask-icon", href: "/icons/safari-pinned-tab.svg", color: "#3eaf7c" }],
        ["meta", { name: "msapplication-TileImage", content: "/images/homescreen144.png" }],
        ["meta", { name: "msapplication-TileColor", content: "#000000" }]
    ],
    plugins: [
        ["code-switcher"],
        ["tabs"],
        ["vuepress-plugin-check-md"],
        // [
        //     "vuepress-plugin-code-copy",
        //     {
        //         color: "#999",
        //     }
        // ],
        [
            "@vuepress/pwa",
            {
                serviceWorker: true,
                updatePopup: true
            }
        ],
        [
            "vuepress-plugin-container",
            {
                type: "important",
                defaultTitle: {
                    "/": "IMPORTANT"
                },
            },
        ],
        [
            "vuepress-plugin-container",
            {
                type: "note",
                defaultTitle: {
                    "/": "NOTE"
                },
            },
        ],
    ],
    markdown: {
        anchor: {
            permalink: true,
            permalinkBefore: true,
            permalinkSymbol: "💧"
        },
        lineNumbers: true,
        extractHeaders: ["h2", "h3", "h4"],
        extendMarkdown: (md) => {
            md.set({ typographer: true });
            // use additional markdown-it plugins
            md.use(require("markdown-it-include"), "./includes/")
                .use(require("markdown-it-deflist"))
                .use(require("markdown-it-replacements"));
        }
    },
    themeConfig: {
        editLinks: true,
        lastUpdated: true, // "Last Updated",
        repo: "microsoft/FluidFramework",
        docsDir: "docs",
        smoothScroll: true,
        sidebarDepth: 1,
        nav: getNav(),
        sidebar: {
            "/guide/": getGuideSidebar(),
            "/examples/": getExamplesSidebar(),
            "/patterns/": getPatternsSidebar(),
            "/api/": getApiSidebar(),
            "/how/": getHowSidebar(),
            "/advanced/": getAdvancedSidebar(),
            "/team/": getTeamSidebar(),
        },
    }
}
