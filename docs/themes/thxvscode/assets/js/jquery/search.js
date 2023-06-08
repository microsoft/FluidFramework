export function loadNavSearch() {
	$(".nav-search").submit(function () {
		var qt = $(this).find(".search-box").val().trim();
		if (!qt || qt == "") {
			window.location.href = "/Search";
		} else {
			window.location.href = "/Search?q=" + encodeURIComponent(qt).replace(/%20/g, "+");
		}
		return false;
	});
}
