/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import ExecutionEnvironment from "@docusaurus/ExecutionEnvironment";
import { useEffect, useId, useRef, useState, type ReactElement } from "react";

interface PagefindSearchProps {
	mobile?: boolean;
	className?: string;
}

interface PagefindModule {
	search: (query: string) => Promise<{ results: PagefindResult[] }>;
	init?: () => Promise<void>;
}

interface PagefindResult {
	id: string;
	data: () => Promise<PagefindResultData>;
}

interface PagefindResultData {
	url: string;
	meta: {
		title?: string;
	};
	excerpt?: string;
}

interface SearchResult {
	id: string;
	title: string;
	url: string;
	excerpt: string;
}

type PagefindWindow = Window & {
	fluidFrameworkPagefind?: PagefindModule;
};

type SearchState = "idle" | "loading" | "ready" | "unavailable" | "error";

const maximumResults = 8;
const maximumResultsBeforeDeduplication = 24;
const pagefindLoaderPath = "/pagefind-loader.js";
const pagefindLoadedEventName = "fluid-framework-pagefind-loaded";
let pagefindLoadPromise: Promise<PagefindModule> | undefined;

function getSearchNavbarItemClassName(
	mobile: boolean | undefined,
	className: string | undefined,
): string {
	return [
		"ffcom-pagefind-search",
		mobile === true ? "ffcom-pagefind-search--mobile" : undefined,
		className,
	]
		.filter((value): value is string => value !== undefined && value.length > 0)
		.join(" ");
}

function textFromHtml(html: string | undefined): string {
	if (html === undefined || html.length === 0) {
		return "";
	}

	if (ExecutionEnvironment.canUseDOM !== true) {
		return html;
	}

	const element = document.createElement("div");
	element.innerHTML = html;
	return element.textContent ?? "";
}

function getPagefindWindow(): PagefindWindow {
	return window as PagefindWindow;
}

async function loadPagefind(): Promise<PagefindModule> {
	if (ExecutionEnvironment.canUseDOM !== true) {
		throw new Error("Pagefind can only load in the browser.");
	}

	const pagefindWindow = getPagefindWindow();
	const loadedPagefind = pagefindWindow.fluidFrameworkPagefind;
	if (loadedPagefind !== undefined) {
		return loadedPagefind;
	}

	pagefindLoadPromise ??= new Promise<PagefindModule>((resolve, reject) => {
		function resolvePagefind(): void {
			const resolvedPagefind = pagefindWindow.fluidFrameworkPagefind;
			if (resolvedPagefind === undefined) {
				reject(new Error("Pagefind loader did not initialize."));
				return;
			}

			resolve(resolvedPagefind);
		}

		function rejectPagefind(): void {
			window.removeEventListener(pagefindLoadedEventName, resolvePagefind);
			reject(new Error("Pagefind loader failed to load."));
		}

		window.addEventListener(pagefindLoadedEventName, resolvePagefind, { once: true });

		const existingLoader = document.querySelector<HTMLScriptElement>(
			`script[src="${pagefindLoaderPath}"]`,
		);
		if (existingLoader !== null) {
			return;
		}

		const loader = document.createElement("script");
		loader.async = true;
		loader.src = pagefindLoaderPath;
		loader.type = "module";
		loader.addEventListener("error", rejectPagefind, { once: true });
		document.head.append(loader);
	});

	return pagefindLoadPromise.then(async (pagefind) => {
		await pagefind.init?.();
		return pagefind;
	});
}

function getSearchResultDeduplicationKey(result: SearchResult): string {
	if (result.url.startsWith("/docs/api/")) {
		return `api:${result.title.toLocaleLowerCase()}`;
	}

	return result.url;
}

function deduplicateSearchResults(results: SearchResult[]): SearchResult[] {
	const deduplicatedResults: SearchResult[] = [];
	const seenKeys = new Set<string>();

	for (const result of results) {
		const key = getSearchResultDeduplicationKey(result);
		if (!seenKeys.has(key)) {
			seenKeys.add(key);
			deduplicatedResults.push(result);
		}
	}

	return deduplicatedResults;
}

export default function PagefindSearch({ mobile, className }: PagefindSearchProps): ReactElement {
	const dialogTitleId = useId();
	const inputRef = useRef<HTMLInputElement>(null);
	const pagefindRef = useRef<PagefindModule>();
	const [isOpen, setIsOpen] = useState<boolean>(false);
	const [query, setQuery] = useState<string>("");
	const [searchState, setSearchState] = useState<SearchState>("idle");
	const [isSearching, setIsSearching] = useState<boolean>(false);
	const [results, setResults] = useState<SearchResult[]>([]);

	const trimmedQuery = query.trim();

	useEffect(() => {
		if (isOpen !== true || ExecutionEnvironment.canUseDOM !== true) {
			return;
		}

		inputRef.current?.focus();
	}, [isOpen]);

	useEffect(() => {
		if (isOpen !== true || ExecutionEnvironment.canUseDOM !== true) {
			return;
		}

		function closeOnEscape(event: KeyboardEvent): void {
			if (event.key === "Escape") {
				setIsOpen(false);
			}
		}

		document.addEventListener("keydown", closeOnEscape);
		return () => {
			document.removeEventListener("keydown", closeOnEscape);
		};
	}, [isOpen]);

	useEffect(() => {
		if (isOpen !== true) {
			return;
		}

		if (pagefindRef.current !== undefined) {
			setSearchState("ready");
			return;
		}

		let canceled = false;
		setSearchState("loading");

		loadPagefind()
			.then((pagefind) => {
				if (canceled === true) {
					return;
				}

				pagefindRef.current = pagefind;
				setSearchState("ready");
			})
			.catch(() => {
				if (canceled === false) {
					setSearchState("unavailable");
				}
			});

		return () => {
			canceled = true;
		};
	}, [isOpen]);

	useEffect(() => {
		if (searchState !== "ready" || trimmedQuery.length === 0) {
			setResults([]);
			setIsSearching(false);
			return;
		}

		const pagefind = pagefindRef.current;
		if (pagefind === undefined) {
			return;
		}

		let canceled = false;
		const timeout = window.setTimeout(() => {
			setIsSearching(true);
			pagefind
				.search(trimmedQuery)
				.then(async (response: { results: PagefindResult[] }) => {
					const loadedResults = await Promise.all(
						response.results
							.slice(0, maximumResultsBeforeDeduplication)
							.map(async (result: PagefindResult) => {
								const data = await result.data();
								return {
									id: result.id,
									title: data.meta.title ?? data.url,
									url: data.url,
									excerpt: textFromHtml(data.excerpt),
								};
							}),
					);

					if (canceled === false) {
						setResults(
							deduplicateSearchResults(loadedResults).slice(0, maximumResults),
						);
						setIsSearching(false);
						setSearchState("ready");
					}
				})
				.catch(() => {
					if (canceled === false) {
						setResults([]);
						setIsSearching(false);
						setSearchState("error");
					}
				});
		}, 200);

		return () => {
			canceled = true;
			window.clearTimeout(timeout);
		};
	}, [searchState, trimmedQuery]);

	return (
		<div className={getSearchNavbarItemClassName(mobile, className)} data-pagefind-ignore="all">
			<button
				aria-label="Search documentation"
				className="ffcom-pagefind-search-button"
				type="button"
				onClick={() => {
					setIsOpen(true);
				}}
			>
				<span aria-hidden="true" className="ffcom-pagefind-search-icon" />
				<span>Search</span>
			</button>
			{isOpen === true && (
				<div
					className="ffcom-pagefind-search-overlay"
					role="presentation"
					onMouseDown={() => {
						setIsOpen(false);
					}}
				>
					<section
						aria-labelledby={dialogTitleId}
						aria-modal="true"
						className="ffcom-pagefind-search-dialog"
						role="dialog"
						onMouseDown={(event) => {
							event.stopPropagation();
						}}
					>
						<div className="ffcom-pagefind-search-header">
							<h2 id={dialogTitleId}>Search documentation</h2>
							<button
								aria-label="Close search"
								className="ffcom-pagefind-search-close-button"
								type="button"
								onClick={() => {
									setIsOpen(false);
								}}
							>
								×
							</button>
						</div>
						<input
							ref={inputRef}
							aria-label="Search query"
							className="ffcom-pagefind-search-input"
							onChange={(event) => {
								setQuery(event.target.value);
							}}
							placeholder="Search Fluid Framework docs"
							type="search"
							value={query}
						/>
						<div className="ffcom-pagefind-search-results">
							{searchState === "unavailable" && (
								<p className="ffcom-pagefind-search-status">
									Search is available after building the site.
								</p>
							)}
							{searchState === "error" && (
								<p className="ffcom-pagefind-search-status">
									Search could not load results.
								</p>
							)}
							{(searchState === "loading" || isSearching === true) && (
								<p className="ffcom-pagefind-search-status">Searching...</p>
							)}
							{searchState === "ready" &&
								isSearching === false &&
								trimmedQuery.length > 0 &&
								results.length === 0 && (
									<p className="ffcom-pagefind-search-status">
										No results found.
									</p>
								)}
							{results.map((result) => (
								<a
									className="ffcom-pagefind-search-result"
									href={result.url}
									key={result.id}
									onClick={() => {
										setIsOpen(false);
									}}
								>
									<strong>{result.title}</strong>
									{result.excerpt.length > 0 && <span>{result.excerpt}</span>}
								</a>
							))}
						</div>
					</section>
				</div>
			)}
		</div>
	);
}
