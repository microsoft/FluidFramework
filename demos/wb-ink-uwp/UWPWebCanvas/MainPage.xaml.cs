using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Threading.Tasks;
using Windows.Devices.Input;
using Windows.Foundation;
using Windows.Security.Authentication.OnlineId;
using Windows.Storage;
using Windows.Storage.Streams;
using Windows.UI;
using Windows.UI.Xaml.Controls;
using Windows.UI.Xaml.Input;
using Windows.UI.Xaml.Media;
using Windows.UI.Xaml.Shapes;
using Windows.Web;

namespace UWPWebCanvas
{
	public sealed partial class MainPage : Page
	{
		public MainPage()
		{
			this.InitializeComponent();

			var uri = BrowserCanvas.BuildLocalStreamUri("index", "index.html");
			BrowserCanvas.NavigateToLocalStreamUri(uri, new StreamUriWinRTResolver());
		}
	}

	public sealed class StreamUriWinRTResolver : IUriToStreamResolver
	{
		public IAsyncOperation<IInputStream> UriToStreamAsync(Uri uri)
		{
			if (uri == null)
			{
				throw new Exception();
			}
			string path = uri.AbsolutePath;

			// Because of the signature of the this method, it can't use await, so we 
			// call into a seperate helper method that can use the C# await pattern.
			return GetContent(path).AsAsyncOperation();
		}

		private async Task<IInputStream> GetContent(string path)
		{
			// We use a package folder as the source, but the same principle should apply
			// when supplying content from other locations
			try
			{
				Uri localUri = new Uri("ms-appx:///" + path);
				StorageFile f = await StorageFile.GetFileFromApplicationUriAsync(localUri);
				IRandomAccessStream stream = await f.OpenAsync(FileAccessMode.Read);
				return stream;
			}
			catch (Exception) { throw new Exception("Invalid path"); }
		}
	}

}
