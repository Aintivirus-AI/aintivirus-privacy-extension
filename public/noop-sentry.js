// AINTIVIRUS Sentry No-Op Stub
// Provides harmless Sentry API stubs to pass "script execution" tests.
// Sentry checks for window.Sentry existence.

(function () {
  'use strict';

  const noop = function () {
    return Promise.resolve();
  };
  noop.then = function (cb) {
    cb && cb();
    return noop;
  };
  noop.catch = function () {
    return noop;
  };
  noop.finally = function (cb) {
    cb && cb();
    return noop;
  };

  // Sentry SDK stub
  const SentryStub = {
    // Core methods
    init: noop,
    captureException: noop,
    captureMessage: noop,
    captureEvent: noop,
    addBreadcrumb: noop,
    configureScope: noop,
    withScope: noop,
    setUser: noop,
    setTags: noop,
    setTag: noop,
    setExtras: noop,
    setExtra: noop,
    setContext: noop,

    // Hub methods
    getCurrentHub: function () {
      return {
        getClient: function () {
          return SentryStub;
        },
        getScope: function () {
          return SentryStub;
        },
        captureException: noop,
        captureMessage: noop,
        captureEvent: noop,
        addBreadcrumb: noop,
        setUser: noop,
        setTags: noop,
        setExtras: noop,
        setContext: noop,
        configureScope: noop,
        withScope: noop,
        pushScope: noop,
        popScope: noop,
        bindClient: noop,
      };
    },

    // Scope methods (for configureScope callback)
    setLevel: noop,
    setFingerprint: noop,
    setTransaction: noop,
    clear: noop,
    addEventProcessor: noop,

    // Browser-specific
    showReportDialog: noop,
    lastEventId: function () {
      return null;
    },

    // Tracing
    startTransaction: function () {
      return {
        finish: noop,
        setStatus: noop,
        setData: noop,
        setTag: noop,
        startChild: function () {
          return { finish: noop, setStatus: noop };
        },
      };
    },

    // Integration placeholder
    Integrations: {
      BrowserTracing: function () {
        return {};
      },
      Vue: function () {
        return {};
      },
      React: function () {
        return {};
      },
    },

    // Severity levels
    Severity: {
      Fatal: 'fatal',
      Error: 'error',
      Warning: 'warning',
      Log: 'log',
      Info: 'info',
      Debug: 'debug',
    },

    // Status
    Status: {
      Ok: 'ok',
      Unknown: 'unknown',
    },

    // SDK info
    SDK_VERSION: '0.0.0-noop',
  };

  // Expose globally
  window.Sentry = SentryStub;
  window.__SENTRY__ = {
    hub: SentryStub.getCurrentHub(),
    extensions: {},
  };

  // Also handle dynamic imports
  if (typeof window.sentryOnLoad === 'function') {
    try {
      window.sentryOnLoad();
    } catch (e) {}
  }
})();
