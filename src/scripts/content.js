/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';

(function() {

  // http://stackoverflow.com/a/1268202/353337
  var getMeta = function(keys) {
    // extract a bunch of given keys from the meta section of the document
    var out = {};
    var metas = document.getElementsByTagName('meta');
    for (var i = 0; i < metas.length; i++) {
      var lowercaseKey = metas[i].getAttribute('name').toLowerCase();
      if (keys.indexOf(lowercaseKey) >= 0) {
        out[lowercaseKey] = metas[i].getAttribute('content');
      }
    }
    return out;
  };

  // Listen for messages
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    // If the received message has the expected format...
    if (msg.keys) {
      // sendResponse(document.all[0].outerHTML);
      sendResponse(getMeta(msg.keys));
    }
  });

})();
