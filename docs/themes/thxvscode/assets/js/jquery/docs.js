// Scrollspy and hashlink
export function loadDocsJavascript() {
	/**
	 * Highlight section navigation on scroll
	 * Alternative position: sticky to avoid Edge bug with position: sticky
	 * https://wpdev.uservoice.com/forums/257854-microsoft-edge-developer/suggestions/6263621-position-sticky
	 */
	$("body").scrollspy({ target: "#docs-subnavbar" });

	const affixPaddingTop = 70;

	// Set a local storage variable when the mobile nav dropdown has been changed
	$("#small-nav-dropdown").change(function () {
		localStorage.setItem('mobileNavChanged', 'true');
	});

	// If the mobile nav changed variable has been set, restore focus to the mobile nav and remove the variable
	if (localStorage.getItem('mobileNavChanged') === 'true') {
        $('#small-nav-dropdown').focus();
        localStorage.removeItem('mobileNavChanged');
    }

	$("#docs-subnavbar").affix({
		offset: {
			top: function () {
				return $("#docs-subnavbar").parent().offset().top - affixPaddingTop;
			},
			bottom: 400,
		},
	});

	/**
	 * position: sticky polyfill for left navbar
	 */

	StickyFill.add($(".docs-navbar-container"));

	$(".collapse")
		.on("hidden.bs.collapse", function () {
			$(this).parent().addClass("collapsed");
			$(this).parent().removeClass("expanded");
		})
		.on("shown.bs.collapse", function () {
			$(this).parent().addClass("expanded");
			$(this).parent().removeClass("collapsed");
		});
	$("#small-nav-dropdown").change(function () {
		window.location = this.value;
	});

	var userAgent = navigator.userAgent;
	var isMacintosh = userAgent.indexOf("Macintosh") >= 0;
	var isLinux = userAgent.indexOf("Linux") >= 0;
	var isWindows = userAgent.indexOf("Windows") >= 0;

	// Only change the DOM if we know anything at all
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
