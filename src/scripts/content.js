/**
 * @license PaperHive Chrome Extension v0.0.3
 * (c) 2015 Nico Schlömer <nico@paperhive.org>
 * License: GPL-3
 */
'use strict';

(function() {
  var getMetaValue = function(keys) {
    // Extract the value of a given meta key. If more than one key is given, it
    // returns the value of the first key it finds.
    var metas = document.getElementsByTagName('meta');
    for (var i = 0; i < keys.length; i++) {
      // namedItem() should be case insensitive, cf.
      // <http://www.w3.org/TR/DOM-Level-2-HTML/html.html>
      var item = metas.namedItem(keys[i]);
      if (item) {
        var content = item.getAttribute('content');
        if (content) {
          return content;
        }
      }
    }
    return null;
  };

  // Listen for messages
  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    // If the received message has the expected format...
    if (msg.keys) {
      sendResponse(getMetaValue(msg.keys));
    }
  });
})();
