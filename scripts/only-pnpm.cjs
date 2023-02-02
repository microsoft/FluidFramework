/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * This script is used to prompt users to use pnpm in a project. This helps guide new contributors to the right tools.
 * To use this script in a project, add a "preinstall" script to the package.json that calls this script.
 */

const message = `
╔═════════════════════════════════════════════════════════════╗
║                                                             ║
║   Use "pnpm install" for installation in this project.      ║
║                                                             ║
║   If you don't have pnpm, install it via "npm i -g pnpm".   ║
║   For more details, see the README.                         ║
║                                                             ║
╚═════════════════════════════════════════════════════════════╝
`;

console.error(message);
process.exit(1);
