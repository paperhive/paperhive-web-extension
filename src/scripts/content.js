'use strict';

// for webpack
require('../styles/content.less');

const getMetaValue = (keys) => {
  // Extract the value of a given meta key. If more than one key is given, it
  // returns the value of the first key it finds.
  const metas = document.getElementsByTagName('meta');
  for (let i = 0; i < keys.length; i++) {
    // namedItem() should be case insensitive, cf.
    // <http://www.w3.org/TR/DOM-Level-2-HTML/html.html>
    const item = metas.namedItem(keys[i]);
    if (item) {
      const content = item.getAttribute('content');
      if (content) {
        return content;
      }
    }
  }
  return null;
};

// Listen for messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // If the received message has the expected format...
  if (msg.keys) {
    sendResponse(getMetaValue(msg.keys));
  }
});
