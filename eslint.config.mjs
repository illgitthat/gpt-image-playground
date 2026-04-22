import { defineConfig } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = defineConfig(
    ...nextCoreWebVitals,
    {
        languageOptions: {
            parserOptions: {
                warnOnUnsupportedTypeScriptVersion: false
            }
        },
        rules: {
            "react-hooks/set-state-in-effect": "off"
        }
    }
);

export default config;
