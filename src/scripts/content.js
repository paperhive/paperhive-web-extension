'use strict';

// for webpack
require('../styles/content.less');

const config = require('../../config.json');

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

chrome.runtime.sendMessage(
  {
    getDocumentData: true,
  },
  (response) => {
    const thisRevision = response.revisions[response.indices.thisRevision];
    if (!thisRevision.isOpenAccess && response.indices.latestOa !== -1) {
      // There is an open-access version of this article available
      const a = document.createElement('a');
      const latestOaRevision = response.revisions[response.indices.latestOa];
      a.setAttribute(
        'href',
        `${config.frontendUrl}/documents/${thisRevision.id}/revisions/${latestOaRevision.revision}`
      );
      a.setAttribute(
        'target', '_blank'
      );

      // Creating Elements
      const div0 = document.createElement('div');
      div0.classList.add('ph-notification-box');

      const text = document.createTextNode(
        'There is an open-access version of this article available via PaperHive.'
      );

      div0.appendChild(text);
      a.appendChild(div0);

      // Appending to DOM
      document.body.appendChild(a);
    }
  }
);
