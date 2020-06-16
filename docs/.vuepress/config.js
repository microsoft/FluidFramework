/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");
const process = require("process");

const INCLUDE_PATH = ".vuepress/includes/";
const BASE_URL = process.env.BASE_URL || "https://fluid-docs.azurewebsites.net";
const DOCS_AUDIENCE = process.env.DOCS_AUDIENCE || "";
const THIS_VERSION = process.env.THIS_VERSION || "0.19";
const MASTER_BRANCH_VERSION = process.env.MASTER_BRANCH_VERSION || "0.19";
const RELEASE_VERSION = process.env.RELEASE_VERSION || "0.18";
const N1_VERSION = process.env.N1_VERSION || "0.17";
const VUEPRESS_BASE = process.env.VUEPRESS_BASE || `/versions/${THIS_VERSION}/`;
const RELEASE_URL = BASE_URL;
const N1_URL = `${BASE_URL}/versions/${N1_VERSION}/`;
const MASTER_BRANCH_URL = `${BASE_URL}/versions/latest/`;

const packagesToExclude = [
    "client-api",
    "experimental-creation-driver",
    "host-service-interfaces",
    "iframe-host",
    "index",
];

const apiMapping = new Map([
    ["aqueduct", "Framework"],
    ["component-core-interfaces", "Framework"],
    ["framework-interfaces", "Framework"],
    ["undo-redo", "Framework"],
    ["cell", "Distributed Data Structures"],
    ["counter", "Distributed Data Structures"],
    ["ink", "Distributed Data Structures"],
    ["map", "Distributed Data Structures"],
    ["sequence", "Distributed Data Structures"],
    ["matrix", "Distributed Data Structures"],
    ["ordered-collection", "Distributed Data Structures"],
    ["register-collection", "Distributed Data Structures"],
    ["shared-object-base", "Distributed Data Structures"],
    ["component-runtime", "Runtime"],
    ["container-runtime", "Runtime"],
    ["runtime-definitions", "Runtime"],
    ["container-loader", "Loader"],
    ["container-definitions", "Loader"],
    ["execution-context-loader", "Loader"],
    ["web-code-loader", "Loader"],
    ["driver-base", "Driver"],
    ["driver-definitions", "Driver"],
    ["file-driver", "Driver"],
    ["iframe-driver", "Driver"],
    ["replay-driver", "Driver"],
    ["routerlicious-driver", "Driver"],
    ["base-host", "Hosts"],
    ["debugger", "Tools"],
    ["merge-tree-client-replay", "Tools"],
    ["replay-tool", "Tools"],
    ["common-utils", "Miscellaneous"],
    ["common-definitions", "Internal"],
    ["driver-utils", "Internal"],
]);

const compact = (input) => {
    return input.filter(x => x);
};

const listPages = (dirPath, includeIndex = false) => {
    dirPath = path.join(__dirname, dirPath);
    let pages = [];
    if (!fs.existsSync(dirPath)) {
        return pages;
    }

    const files = fs.readdirSync(dirPath);
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

const packageFromFilePath = (filepath) => {
    return path.basename(filepath).split(".")[0];
}

const getNav = () => {
    const nav = [
        { text: "What is Fluid?", link: "/what-is-fluid.md" },
        { text: "Docs", link: "/docs/getting-started.md" },
        { text: "Tutorials", link: "/tutorials/" },
        // { text: "Ecosystem", link: "/ecosystem/" },
        { text: "API", link: "/api/" },
        {
            text: "Versions",
            items: [
                { text: `v${RELEASE_VERSION}`, link: BASE_URL },
                { text: `v${N1_VERSION}`, link: N1_URL },
                { text: `Bleeding edge`, link: MASTER_BRANCH_URL }
            ]
        },
    ];

    function filterFalsy(item) {
        if (item) {
            if (item.items) {
                item.items = item.items.filter(filterFalsy);
            }
        }
        return item;
    }

    const filtered = nav.filter(filterFalsy);
    return filtered;
}

/**
 * The API docs are built separately from the core docs, and if the API files aren't present but are linked in a
 * sidebar, there's a build error. This function only adds API sidebar items if the files are present. This allows local
 * builds without the API documentation - which is much faster when doing local testing.
 */
const getApiSidebar = () => {
    const directoryPath = path.join(__dirname, "../api");
    const files = fs.readdirSync(directoryPath);

    let apiCategories = new Map();
    let apiSidebar = [{
        title: "API Overview",
        path: "index",
        collapsable: false,
        sidebarDepth: 0
    }];

    for (const file of files) {
        const packageName = packageFromFilePath(file);
        if (packagesToExclude.includes(packageName)) {
            continue;
        }

        let category = apiMapping.get(packageName) || "Unknown";
        if (!apiCategories.has(category)) {
            // console.log(`Creating entry for ${category}`);
            apiCategories.set(category, [file]);
        } else {
            const current = apiCategories.get(category);
            current.push(file);
            apiCategories.set(category, current);
        }
    }

    // console.log(apiCategories);
    if (apiCategories.get("Unknown")) {
        const unknownCategory = new Set(apiCategories.get("Unknown").map(f => packageFromFilePath(f)));
        console.log(`Packages with no category:`);
        console.log(unknownCategory);
    }

    apiCategories.forEach((value, key) => {
        apiSidebar.push({
            title: key,
            sidebarDepth: 2,
            children: value
        });
    });

    return apiSidebar;
}

const getDocsSidebar = () => {
    return [
        {
            title: "Installation",
            collapsable: false,
            // path: "",
            children: [
                "getting-started.md",
                "hello-world.md",
                "create-a-new-fluid-component",
            ]
        },
        {
            title: "Main concepts",
            collapsable: false,
            children: [
                "guide.md",
                "dds.md",
                "components.md",
                "aqueduct.md",
                "component-interfaces.md",
            ]
        },
        {
            title: "DDS reference",
            collapsable: false,
            // path: "dds",
            children: [
                // "overview",
                "SharedDirectory.md",
                "SharedMap.md",
                "SharedCounter.md",
                "SharedCell.md",
                {
                    title: "Sequences",
                    path: "sequences.md",
                    children: [
                        "SharedNumberSequence.md",
                        "SharedObjectSequence.md",
                        "SharedString.md",
                    ],
                },
                "SharedMatrix.md",
                "consensus.md",
            ]
        },
        {
            title: "Component model",
            collapsable: false,
            children: [
                "component-design-principles.md",
            ]
        },
        {
            title: "Guides",
            collapsable: false,
            children: [
                "visual-component.md",
                // "data-component.md",
                // "embed-components.md",
                // "cross-component.md",
                // "component-patterns.md",
                // "component-collections.md",
                // "bots.md",
                // "component-best-practices.md",
            ]
        },
        {
            title: "Advanced",
            collapsable: true,
            children: [
                "tob.md",
                "dds-anatomy.md",
                "container-and-component-loading.md",
            ]
        },
        {
            title: "Misc",
            collapsable: true,
            // path: "",
            children: [
                "release-process.md",
                "breaking-changes.md",
                "compatibility.md",
                "doc-system.md",
            ]
        },
    ];
}

const getTutorialsSidebar = () => {
    return [
        {
            title: "Tutorials",
            collapsable: false,
            // path: "",
            children: [
                "",
                "dice-roller.md",
                "sudoku.md",
            ]
        },
        {
            title: "Examples",
            collapsable: false,
            // path: "",
            children: [
                "badge.md",
            ]
        },

    ];
}

const getHowSidebar = () => {
    return [
        "",
    ];
}

const getAllSidebars = () => {
    return {
        "/docs/": getDocsSidebar(),
        "/tutorials/": getTutorialsSidebar(),
        "/api/": getApiSidebar(),
        "/how/": getHowSidebar(),
    };
}

const getThemeConfig = () => {
    const config = {
        DOCS_AUDIENCE: DOCS_AUDIENCE,
        THIS_VERSION: THIS_VERSION,
        MASTER_BRANCH_VERSION: MASTER_BRANCH_VERSION,
        MASTER_BRANCH_URL: MASTER_BRANCH_URL,
        RELEASE_VERSION: RELEASE_VERSION,
        RELEASE_URL: RELEASE_URL,
        N1_VERSION: N1_VERSION,
        N1_URL: N1_URL,
        editLinks: true,
        lastUpdated: false, // "Last Updated",
        docsDir: "docs",
        heroSymbol: permalinkSymbol(),
        repo: "microsoft/FluidFramework",
        smoothScroll: true,
        sidebarDepth: 1,
        nav: getNav(),
        sidebar: getAllSidebars(),
    };
    return config;
}

function permalinkSymbol() {
    const symbol = "💧";
    return symbol;
}

module.exports = {
    title: `Fluid Framework v${THIS_VERSION}`,
    description: "State that flows",
    evergreen: true,
    base: VUEPRESS_BASE,
    head: [
        ["link", { rel: "icon", href: "/images/homescreen48.png" }],
        // ["link", { rel: "manifest", crossorigin: "use-credentials", href: "/manifest.webmanifest" }],
        // ["meta", { name: "theme-color", content: "#00BCF2" }],
        // ["meta", { name: "apple-mobile-web-app-capable", content: "yes" }],
        // ["meta", { name: "apple-mobile-web-app-status-bar-style", content: "black" }],
        // ["link", { rel: "apple-touch-icon", href: "/images/homescreen192.png" }],
        // ["meta", { name: "msapplication-TileImage", content: "/images/homescreen144.png" }],
        // ["meta", { name: "msapplication-TileColor", content: "#000000" }]
    ],
    plugins: [
        ["alias"],
        ["tabs"],
        ["vuepress-plugin-check-md"],
        // [
        //     "vuepress-plugin-code-copy",
        //     {
        //         color: "#999",
        //     }
        // ],
        // [
        //     "@vuepress/pwa",
        //     {
        //         serviceWorker: true,
        //         updatePopup: true
        //     }
        // ],
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
            permalinkSymbol: permalinkSymbol(),
        },
        lineNumbers: true,
        extractHeaders: ["h2", "h3", "h4"],
        toc: { includeLevel: [2, 3, 4] },
        extendMarkdown: (md) => {
            md.set({ typographer: true });
            // use additional markdown-it plugins
            md.use(require("markdown-it-replacements")) // typography enhancements
                .use(require("markdown-it-smartarrows")) // typography enhancements
                .use(require("markdown-it-include"), INCLUDE_PATH)
                .use(require("markdown-it-deflist"))
                .use(require("markdown-it-regexp"))
                .use(require("markdown-it-implicit-figures"), { figCaption: true });
        }
    },
    themeConfig: getThemeConfig(),
}
