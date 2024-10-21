/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import { Box } from "@mui/material";
import { Inter } from "next/font/google";
import Image from "next/image";
import { SnackbarProvider } from "notistack";

import bgImg from "/public/msft-bg.webp"; // eslint-disable-line import/no-unresolved

import React from "react";

const inter = Inter({ subsets: ["latin"] });

/**
 * A root page layout used with NextJS.
 * Note that because this layout includes the base <html> and <body> tags, it should only be used once per page.
 */
// eslint-disable-next-line import/no-default-export -- NextJS uses default exports
export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>): JSX.Element {
	return (
		<html lang="en">
			<body className={inter.className}>
				<Box
					sx={{
						minWidth: "100vw",
						minHeight: "100vh",
						overflow: "scroll",
					}}
				>
					<Image
						src={bgImg}
						alt="background image"
						placeholder="blur"
						fill
						// sizes="100vw"
						style={{
							objectFit: "fill",
							zIndex: -1,
						}}
					/>

					<SnackbarProvider anchorOrigin={{ horizontal: "right", vertical: "top" }}>
						{children}
					</SnackbarProvider>
				</Box>
			</body>
		</html>
	);
}
