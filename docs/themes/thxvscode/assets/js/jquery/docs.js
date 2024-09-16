export function loadDocsJavascript() {
	/**
	 * Highlight section navigation on scroll in the right navigation
	 */
	$("body").scrollspy({ target: "#docs-subnavbar" });

	// Set a local storage variable when the nav dropdown (only visible for narrow layouts) has been changed
	$("#small-nav-dropdown").change(function () {
		localStorage.setItem("mobileNavChanged", "true");
	});

	// If the nav dropdown (only visible for narrow layouts) changed variable has been set, restore focus to
	// the nav dropdown and remove the variable
	if (localStorage.getItem("mobileNavChanged") === "true") {
		$("#small-nav-dropdown").focus();
		localStorage.removeItem("mobileNavChanged");
	}

	// Tries to set a bootstrap affix to the right navigation, but doesn't seem to really have an effect.
	// Maybe duplicative with affix information in the html already.
	const affixPaddingTop = 70;
	$("#docs-subnavbar").affix({
		offset: {
			top: function () {
				return $("#docs-subnavbar").parent().offset().top - affixPaddingTop;
			},
			bottom: 400,
		},
	});

	/**
	 * position: sticky polyfill for left navbar.  Doesn't work because the parent element is 0-height.
	 */
	StickyFill.add($(".docs-navbar-container"));

	// Expand/collapse support for the left nav bar
	$(".collapse")
		.on("hidden.bs.collapse", function () {
			$(this).parent().addClass("collapsed");
			$(this).parent().removeClass("expanded");
		})
		.on("shown.bs.collapse", function () {
			$(this).parent().addClass("expanded");
			$(this).parent().removeClass("collapsed");
		});
	// Navigate to the selected option for the nav dropdown (only visible for narrow layouts)
	$("#small-nav-dropdown").change(function () {
		window.location = this.value;
	});

	// UA detection, but doesn't seem to actually be used.
	var userAgent = navigator.userAgent;
	var isMacintosh = userAgent.indexOf("Macintosh") >= 0;
	var isLinux = userAgent.indexOf("Linux") >= 0;
	var isWindows = userAgent.indexOf("Windows") >= 0;

	if (isMacintosh || isLinux || isWindows) {
		var mine, other1, other2, other1Label, other2Label;
		if (isMacintosh) {
			mine = "osx";
			other1 = "win";
			other1Label = "Windows";
			other2 = "linux";
			other2Label = "Linux";
		} else if (isWindows) {
			mine = "win";
			other1 = "osx";
			other1Label = "macOS";
			other2 = "linux";
			other2Label = "Linux";
		} else {
			mine = "linux";
			other1 = "osx";
			other1Label = "macOS";
			other2 = "win";
			other2Label = "Windows";
		}
	}

	// Code to show/hide the "#" link for individual sections in the doc pages on mouse hover
	function appendHashLink() {
		function incrementReasonsToBeVisible(header) {
			return () => {
				header.attributes["__interactionCount"]++;
				$(header).children(".hash-link").removeClass("transparent");
			};
		}

		function decrementReasonsToBeVisible(header) {
			return () => {
				header.attributes["__interactionCount"]--;
				if (header.attributes["__interactionCount"] === 0) {
					$(header).children(".hash-link").addClass("transparent");
				}
			};
		}

		var headers = $("h2[data-needslink], h3[data-needslink]");
		for (var i = 0; i < headers.length; i++) {
			var header = headers[i];
			header.attributes["__interactionCount"] = 0;
			$(header).append(
				$(
					`<a class="hash-link" aria-label="${header.textContent} permalink" href="#${header.id}">#</a>`,
				),
			);

			$(header).children(".hash-link").on("focusin", incrementReasonsToBeVisible(header));
			$(header).children(".hash-link").on("focusout", decrementReasonsToBeVisible(header));
			$(header).on("mouseenter", incrementReasonsToBeVisible(header));
			$(header).on("mouseleave", decrementReasonsToBeVisible(header));
			$(header).children(".hash-link").addClass("transparent");
		}
	}

	appendHashLink();
}
