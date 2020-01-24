module.exports = {
    title: "💧 Fluid Framework",
    description: "State that flows",
    evergreen: true,
    plugins: [
        ["vuepress-plugin-check-md"],
        ["tabs"],
        // [
        //     "vuepress-plugin-code-copy",
        //     {
        //         color: "#999",
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
            permalinkSymbol: "💧"
        },
        lineNumbers: true,
        extractHeaders: ["h2", "h3", "h4"],
        extendMarkdown: (md) => {
            // use additional markdown-it plugins
            md.use(require("markdown-it-include"), "./includes/")
                .use(require("markdown-it-deflist"));
        }
    },
    themeConfig: {
        docsDir: "docs",
        editLinks: false,
        lastUpdated: false, // "Last Updated",
        repo: "microsoft/FluidFramework",
        smoothScroll: true,
        sidebarDepth: 1,
        nav: [
            { text: "What is Fluid?", link: "/what-is-fluid" },
            { text: "Guide", link: "/guide/" },
            { text: "Tutorials", link: "/examples/" },
            // { text: "Data Structures", link: "/dds/" },
            { text: "API", link: "/api/overview" },
            {
                text: "🤿 Dive Deeper",
                items: [
                    { text: "How Fluid works", link: "/how/" },
                    { text: "FAQ", link: "/faq/" },
                    { text: "Terminology", link: "/misc/terminology" },
                    { text: "Concepts", link: "/misc/concepts" },
                    {
                        text: "Contributing",
                        items: [
                            { text: "Coding guidelines", link: "/contributing/coding-guidelines" },
                            { text: "Building documentation locally", link: "/contributing/building-documentation" },
                            { text: "Routerlicious build machine", link: "/contributing/r11s-build-machine" },
                        ]
                    }
                ]
            },
        ],
        sidebar: {
            "/api/": [
                {
                    title: "API Overview",
                    path: "overview",
                    collapsable: false,
                    sidebarDepth: 0
                },
                {
                    title: "Framework",
                    sidebarDepth: 2,
                    children: [
                        "fluid-aqueduct",
                        "fluid-aqueduct-react",
                        "fluid-component-core-interfaces",
                        "fluid-framework-interfaces",
                        "fluid-undo-redo",
                    ]
                },
                {
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
                },
                {
                    title: "Runtime",
                    children: [
                        "fluid-component-runtime",
                        "fluid-container-runtime",
                        "fluid-runtime-definitions",
                    ]
                },
                {
                    title: "Loader",
                    children: [
                        "fluid-container-definitions",
                        "fluid-container-loader",
                        "fluid-execution-context-loader",
                        "fluid-web-code-loader",
                    ]
                },
                {
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
                },
                {
                    title: "Sample Hosts",
                    children: [
                        "react-web-host",
                        "tiny-web-host",
                        "fluid-base-host",
                    ]
                },
                {
                    title: "Tools",
                    children: [
                        "fluid-debugger",
                        "fluid-merge-tree-client-replay",
                        "fluid-replay-tool",
                    ]
                },
                {
                    title: "Miscellaneous",
                    children: [
                        "fluid-core-utils",
                    ]
                },
                {
                    title: "Internal/Deprecated",
                    children: [
                        "client-api",
                        "fluid-common-definitions",
                        "fluid-creation-driver",
                        "fluid-driver-utils",
                        "fluid-host-service-interfaces",
                        "fluid-runtime-utils",
                    ]
                },
            ],
            "/guide/": [
                {
                    title: "Guide",
                    collapsable: false,
                    children: [
                        "",
                        "yo-fluid",
                        "build-a-component",
                        "water-park",
                    ]
                },
                {
                    title: "Distributed Data Structures",
                    collapsable: true,
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
                        // {
                        //     title: "Consensus",
                        //     children: [
                        //         "ConsensusQueue",
                        //         "ConsensusRegisterCollection",
                        //         "ConsensusStack",
                        //     ],
                        // },
                    ]
                },
                {
                    title: "Advanced",
                    collapsable: false,
                    children: [
                        "dds-anatomy",
                    ]
                },
            ],
            "/examples/": [
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
                "examples",
                "sudoku",
                "yo-fluid-breakdown",
            ],
            "/how/": [
                "",
                "tob",
                "developer-guide",
            ],
            "/advanced/": [
                "",
                "loading-deep-dive",
            ],
        },
    }
}
