/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const fs = require("fs");
const path = require("path");
const process = require("process");

const INCLUDE_PATH = ".vuepress/includes/";
const BASE_URL = process.env.BASE_URL || "https://fluid-docs.azurewebsites.net";
const DOCS_AUDIENCE = process.env.DOCS_AUDIENCE || "internal";
const THIS_VERSION = process.env.THIS_VERSION || "0.19";
const MASTER_BRANCH_VERSION = process.env.MASTER_BRANCH_VERSION || "0.19";
const RELEASE_VERSION = process.env.RELEASE_VERSION || "0.18";
const N1_VERSION = process.env.N1_VERSION || "0.17";
const VUEPRESS_BASE = process.env.VUEPRESS_BASE || `/versions/${THIS_VERSION}/`;
const RELEASE_URL = BASE_URL;
const N1_URL = `${BASE_URL}/versions/${N1_VERSION}/`;
const MASTER_BRANCH_URL = `${BASE_URL}/versions/latest/`;

const internalOnly = (obj) => {
    if (DOCS_AUDIENCE !== "internal") {
        return null;
    }
    return obj;
};

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

const getNav = () => {
    const nav = [
        { text: "What is Fluid?", link: "/what-is-fluid.md" },
        { text: "Docs", link: "/docs/getting-started.md" },
        { text: "Tutorials", link: "/tutorials/" },
        { text: "Ecosystem", link: "/ecosystem/" },
        { text: "API", link: "/api/overview" },
        // {
        //     text: "🤿 Dive Deeper",
        //     items: [
        //         { text: "How Fluid works", link: "/how/" },
        //         internalOnly({ text: "Big page of docs and decks", link: "/misc/doc-index" }),
        //         internalOnly({ text: "FAQ", link: "/faq/" }),
        //         internalOnly({ text: "Terminology", link: "/misc/terminology" }),
        //         internalOnly({ text: "Concepts", link: "/misc/concepts" }),
        //         internalOnly({
        //             text: "Contributing",
        //             items: [
        //                 { text: "Release process", link: "/contributing/release-process" },
        //                 { text: "Breaking changes", link: "/contributing/breaking-changes" },
        //                 { text: "Compatibility", link: "/contributing/compatibility" },
        //                 { text: "Coding guidelines", link: "/contributing/coding-guidelines" },
        //                 { text: "Documentation system", link: "/contributing/doc-system" },
        //                 { text: "Building documentation locally", link: "/contributing/building-documentation" },
        //                 { text: "Miscellaneous", link: "/contributing/misc" },
        //             ]
        //         }),
        //         internalOnly({
        //             text: "Team",
        //             items: [
        //                 { text: "Updates", link: "/team/" },
        //                 { text: "Routerlicious build machine", link: "/contributing/r11s-build-machine" },
        //             ]
        //         }),
        //     ]
        // },
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

    if (files.includes("fluid-common-utils.md")) {
        apiSidebar.push({
            title: "Miscellaneous",
            children: [
                "fluid-common-utils",
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

const getDocsSidebar = () => {
    return [
        {
            title: "Installation",
            collapsable: false,
            // path: "",
            children: [
                "getting-started.md",
                "dev-env.md",
                "create-a-new-fluid-component",
                "hello-world.md",
                "release-process.md",
            ]
        },
        {
            title: "Main concepts",
            collapsable: false,
            children: [
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
                "SharedDirectory",
                "SharedMap",
                "SharedCounter",
                "SharedCell",
                {
                    title: "Sequences",
                    path: "sequences",
                    children: [
                        "SharedNumberSequence.md",
                        "SharedObjectSequence.md",
                        "SharedString.md",
                    ],
                },
                "SharedMatrix",
                "consensus.md",
            ]
        },
        // {
        //     title: "API",
        //     path: "../",
        //     children: getApiSidebar(),
        // },
        {
            title: "Component model",
            collapsable: false,
            children: [
                "component-design-principles.md",
            ]
        },
        {
            title: "Advanced guides",
            collapsable: false,
            children: [
                "dds-anatomy",
                "container-and-component-loading",
            ]
        },
    ];
}

const getTutorialsSidebar = () => {
    return compact([
        "",
        "dice-roller",
        "sudoku",
        "badge",
        internalOnly({
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
        }),
        internalOnly({
            title: "Containers",
            collapsable: true,
            children: [
                "singletons",
            ]
        }),
    ]);
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
    return compact([
        "",
        "tob",
        internalOnly("developer-guide"),
    ]);
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

const getAllSidebars = () => {
    const sidebars = {
        internal: {
            "/patterns/": getPatternsSidebar(),
            "/advanced/": getAdvancedSidebar(),
            "/team/": getTeamSidebar(),
        },
        all: {
            "/docs/": getDocsSidebar(),
            "/tutorials/": getTutorialsSidebar(),
            "/api/": getApiSidebar(),
            "/how/": getHowSidebar(),
        }
    };

    return Object.assign({},
        sidebars.all,
        DOCS_AUDIENCE === "internal" ? sidebars.internal : {}
    );
}

const getThemeConfig = () => {
    let config = {
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
        smoothScroll: true,
        sidebarDepth: 1,
        nav: getNav(),
        sidebar: getAllSidebars(),
    };
    if (DOCS_AUDIENCE === "internal") {
        config.repo = "microsoft/FluidFramework";
    }
    return config;
}

function permalinkSymbol() {
    const now = new Date(new Date().getTime());
    const start = new Date(Date.UTC(2020, 2 /* 0-based because javascript */, 17));
    const end = new Date(Date.UTC(2020, 2 /* 0-based because javascript */, 18));
    const inRange = start < now && now < end;
    // console.log(`${inRange}: ${start} < ${now} < ${end}`);
    const symbol = inRange ? "🍀" : "💧";
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

    // The below is basically a clone of the vuepress build command, but supports overridding the "base" parameter in a
    // kind of hacky way.
    // extendCli: (cli, options) => {
    //     cli
    //         .command("buildbase [targetDir]", "build dir as static site")
    //         .option("-b, --base <base>", "override the base config option")
    //         .option("-d, --dest <dest>", "specify build output dir (default: .vuepress/dist)")
    //         .option("-t, --temp <temp>", "set the directory of the temporary file")
    //         .option("-c, --cache [cache]", "set the directory of cache")
    //         .option("-w, --workers <#>", "set the number of worker threads")
    //         .option("--no-cache", "clean the cache before build")
    //         .option("--debug", "build in development mode for debugging")
    //         .option("--silent", "build static site in silent mode")
    //         .action((sourceDir = ".", commandOptions) => {
    //             const { debug, silent, workers } = commandOptions

    //             logger.setOptions({ logLevel: silent ? 1 : debug ? 4 : 3 })
    //             env.setOptions({ isDebug: debug, isTest: process.env.NODE_ENV === "test", workerThreads: workers || 1 })

    //             let buildOptions = {
    //                 sourceDir: path.resolve(sourceDir),
    //                 ...options,
    //                 ...commandOptions
    //             };
    //             buildOptions.siteConfig.base = buildOptions.options.base;
    //             logger.debug("siteConfig", buildOptions.siteConfig);

    //             wrapCommand(build(buildOptions));
    //         })
    // },
}
