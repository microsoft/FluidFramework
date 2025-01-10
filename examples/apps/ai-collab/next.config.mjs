/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// We deliberately configure NextJS to not use React Strict Mode, so we don't get double-rendering of React components
// during development. Otherwise containers get loaded twice, and the presence functionality works incorrectly, detecting
// every browser tab that *loaded* a container (but not the one that originally created it) as 2 presence participants.
const nextConfig = {
	reactStrictMode: false,
};

export default nextConfig;
