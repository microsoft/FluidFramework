
import { webDarkTheme, webLightTheme } from '@fluentui/react-components';

export class ThemeHelper {

	public static currentTheme() {
		var defaultTheme = webLightTheme;

		if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
			// The user has a light theme set in their web browser
			console.log('Dark theme detected.');
			defaultTheme = webDarkTheme;
		}

		return defaultTheme;
	}
}