module.exports = {
    "pipeline": {
        "build": [
            "^tsc"
        ],
        "tsc": [
            "^tsc"
        ],
        "test": [
            "build"
        ],
        "lint": [
            "^eslint"
        ],
        "clean": [
            "clean",
        ]
    },
    "npmClient": "yarn"
};
