"use client";

import { Box } from "@mui/material";
import { SnackbarProvider } from 'notistack';
// eslint-disable-next-line import/no-internal-modules
import { Inter } from "next/font/google";
import React from "react";
import Image from 'next/image';
import bgImg from '/public/msft-bg.webp';

const inter = Inter({ subsets: ["latin"] });

export default function PageLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en">
			<body className={inter.className}>
				<Box
					sx={{
						minWidth: '100vw',
						minHeight: '100vh',
						overflow: 'scroll',
					}}
				>
					<Image
						src={bgImg}
						alt="background image"
						placeholder="blur"
						fill
						// sizes="100vw"
						style={{
							objectFit: 'fill',
							zIndex: -1
						}}
					/>

					<SnackbarProvider anchorOrigin={{ horizontal: "right", vertical: 'top' }}>
						{children}
					</SnackbarProvider>

				</Box>
			</body>
		</html>
	);
}
