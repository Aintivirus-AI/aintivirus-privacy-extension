// AINTIVIRUS No-Op Stub
// Defines harmless global stubs for common tracking libraries.
// Used as a redirect target to pass "script execution" tests.

(function() {
  'use strict';
  
  // Generic no-op function
  const noop = function() {};
  noop.q = [];
  noop.push = noop;
  noop.identify = noop;
  noop.track = noop;
  noop.page = noop;
  noop.init = noop;
  noop.start = noop;
  noop.stop = noop;
  noop.reset = noop;
  noop.group = noop;
  noop.alias = noop;
  noop.ready = noop;
  noop.on = noop;
  noop.off = noop;
  noop.once = noop;
  noop.debug = noop;
  
  // Google Analytics stubs
  if (typeof window.ga === 'undefined') {
    window.ga = noop;
    window.ga.l = Date.now();
  }
  
  if (typeof window.gtag === 'undefined') {
    window.gtag = noop;
  }
  
  if (typeof window.dataLayer === 'undefined') {
    window.dataLayer = [];
    window.dataLayer.push = noop;
  }
  
  // Generic analytics object
  if (typeof window.analytics === 'undefined') {
    window.analytics = noop;
  }
})();


