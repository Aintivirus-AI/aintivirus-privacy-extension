// AINTIVIRUS Bugsnag No-Op Stub
// Provides harmless Bugsnag API stubs to pass "script execution" tests.
// Bugsnag checks for window.Bugsnag or window.bugsnag existence.

(function () {
  'use strict';

  const noop = function () {};

  // Bugsnag client stub
  const BugsnagStub = {
    // Initialization
    start: function (config) {
      return BugsnagStub;
    },
    createClient: function (config) {
      return BugsnagStub;
    },

    // Error reporting
    notify: noop,
    notifyException: noop,

    // Breadcrumbs
    leaveBreadcrumb: noop,

    // User info
    setUser: noop,
    getUser: function () {
      return {};
    },

    // Metadata
    addMetadata: noop,
    clearMetadata: noop,
    getMetadata: function () {
      return {};
    },

    // Context
    setContext: noop,
    getContext: function () {
      return null;
    },

    // Session
    startSession: noop,
    pauseSession: noop,
    resumeSession: noop,

    // Callbacks
    addOnError: noop,
    removeOnError: noop,
    addOnSession: noop,
    removeOnSession: noop,
    addOnBreadcrumb: noop,
    removeOnBreadcrumb: noop,

    // Plugin support
    getPlugin: function () {
      return null;
    },

    // Feature flags
    addFeatureFlag: noop,
    addFeatureFlags: noop,
    clearFeatureFlag: noop,
    clearFeatureFlags: noop,

    // Configuration
    isStarted: function () {
      return true;
    },

    // Internal client reference
    _client: {},
  };

  // Legacy API compatibility
  BugsnagStub.noConflict = function () {
    return BugsnagStub;
  };
  BugsnagStub.refresh = noop;

  // Expose globally (both cases)
  window.Bugsnag = BugsnagStub;
  window.bugsnag = BugsnagStub;
  window.bugsnagClient = BugsnagStub;

  // AMD/CommonJS compatibility
  if (typeof define === 'function' && define.amd) {
    define([], function () {
      return BugsnagStub;
    });
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BugsnagStub;
  }
})();

