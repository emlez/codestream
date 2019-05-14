﻿using CodeStream.VisualStudio.Core.Logging;
using CodeStream.VisualStudio.Events;
using CodeStream.VisualStudio.Extensions;
using CodeStream.VisualStudio.Models;
using CodeStream.VisualStudio.Services;
using Microsoft.VisualStudio.LanguageServer.Client;
using Microsoft.VisualStudio.Threading;
using Serilog;
using StreamJsonRpc;
using System;
using System.Collections.Generic;
using System.ComponentModel.Composition;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json;

namespace CodeStream.VisualStudio.LSP {
	/// <summary>
	/// NOTE: See ContentDefinitions.cs for the LanguageClient partial class attributes
	/// </summary>
	[Export(typeof(ILanguageClient))]
	[Guid(Guids.LanguageClientId)]
	public partial class LanguageClient : ILanguageClient, ILanguageClientCustomMessage, IDisposable {
		private static readonly ILogger Log = LogManager.ForContext<LanguageClient>();
		private bool _disposed = false;
		private readonly ILanguageServerProcess _languageServerProcess;

		public event AsyncEventHandler<EventArgs> StartAsync;
#pragma warning disable 0067
		public event AsyncEventHandler<EventArgs> StopAsync;
#pragma warning restore 0067

		//#if DEBUG
		//		/// <summary>
		//		/// This is how we can see a list of contentTypes (used to generate the attrs for this class)
		//		/// </summary>
		//		[Import]
		//		internal IContentTypeRegistryService ContentTypeRegistryService { get; set; }
		//#endif
		private readonly IEventAggregator _eventAggregator;
		private readonly ISettingsService _settingsService;
		private readonly ICodeStreamAgentService _codeStreamAgentService;
		private readonly ISessionService _sessionService;

		[ImportingConstructor]
		public LanguageClient(
			[Import] ICodeStreamAgentService codeStreamAgentService,
			[Import] ISettingsService settingsService,						
			[Import] IWebviewIpc ipc) {
			Instance = this;
			_codeStreamAgentService = codeStreamAgentService;
			_eventAggregator = codeStreamAgentService.EventAggregator;
			_sessionService = codeStreamAgentService.SessionService;
			_settingsService = settingsService;			

			_languageServerProcess = new LanguageServerProcess();
			CustomMessageTarget = new CustomMessageHandler(_eventAggregator, ipc);
		}

		internal static LanguageClient Instance { get; private set; }
		private JsonRpc _rpc;

		public string Name => Application.Name;

		public IEnumerable<string> ConfigurationSections => null;

		public object InitializationOptions {
			get {
				var initializationOptions = new InitializationOptions {
					Extension = _settingsService.GetExtensionInfo(),
					Ide = _settingsService.GetIdeInfo(),
#if DEBUG
					TraceLevel = TraceLevel.Verbose.ToJsonValue(),
					IsDebugging = true,
#else
                    TraceLevel = _settingsService.TraceLevel.ToJsonValue(),
#endif
					Proxy = _settingsService.Proxy,
					ProxySupport = _settingsService.ProxySupport.ToJsonValue()
				};
				Log.Debug(nameof(InitializationOptions) + " {@InitializationOptions}", initializationOptions);

				return initializationOptions;
			}
		}

		public IEnumerable<string> FilesToWatch => null;

		public object MiddleLayer => null;

		public object CustomMessageTarget { get; }

		public async Task<Connection> ActivateAsync(CancellationToken token) {
			await Task.Yield();

			Connection connection = null;

			var process = _languageServerProcess.Create(_settingsService.TraceLevel);

			using (Log.CriticalOperation($"Starting server process. FileName={process.StartInfo.FileName} Arguments={process.StartInfo.Arguments}", Serilog.Events.LogEventLevel.Information)) {
				if (process.Start()) {
					connection = new Connection(process.StandardOutput.BaseStream, process.StandardInput.BaseStream);
				}
			}

			return connection;
		}

		public async Task AttachForCustomMessageAsync(JsonRpc rpc) {
			await Task.Yield();
			_rpc = rpc;

			// Slight hack to use camelCased properties when serializing requests
			_rpc.JsonSerializer.ContractResolver = new CustomCamelCasePropertyNamesContractResolver(new HashSet<Type> { typeof(TelemetryProperties) });
			_rpc.JsonSerializer.NullValueHandling = NullValueHandling.Ignore;
		}

		public async Task OnLoadedAsync() {
			using (Log.CriticalOperation($"{nameof(OnLoadedAsync)}")) {
				// ReSharper disable once PossibleNullReferenceException
				await StartAsync?.InvokeAsync(this, EventArgs.Empty);
			}
		}

		public async Task OnServerInitializedAsync() {
			try {
				using (Log.CriticalOperation($"{nameof(OnServerInitializedAsync)}")) {
					await _codeStreamAgentService.SetRpcAsync(_rpc);
					_sessionService.SetAgentReady();
					_eventAggregator.Publish(new LanguageServerReadyEvent { IsReady = true });
				}
			}
			catch (Exception ex) {
				Log.Fatal(ex, nameof(OnServerInitializedAsync));
				throw;
			}
			await Task.CompletedTask;
		}

		public Task OnServerInitializeFailedAsync(Exception ex) {
			Log.Fatal(ex, nameof(OnServerInitializeFailedAsync));
			throw ex;
		}

		public void Dispose() {
			Dispose(true);
			GC.SuppressFinalize(this);
		}

		protected virtual void Dispose(bool disposing) {
			if (_disposed) return;

			if (disposing) {
				var disposable = CustomMessageTarget as IDisposable;
				disposable?.Dispose();
			}

			_disposed = true;
		}
	}
}
