
import eslint from "@eslint/js";

export default [
    eslint.configs.recommended,
    {
        files: ["*.js"],
        rules: {
            "no-console": "off"
        }
    }
];
