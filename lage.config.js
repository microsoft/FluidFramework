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
        "lint": []
    },
    "npmClient": "yarn"
};
