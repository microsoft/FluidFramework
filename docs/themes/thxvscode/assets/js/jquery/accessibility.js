export function loadSkipToContentButton() {
	var skip_to_main_content_btn = $("#skip-to-content");
	var mainFirstAnchor = $("#main-content button, #main-content a:visible").first();

	skip_to_main_content_btn.click(function () {
		// change focus to the first button or anchor in main content
		setTimeout(function () {
			mainFirstAnchor.focus();
		}, 1); //timeout function is required or else it doesn't move focus
	});
}
