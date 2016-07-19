'use strict';

// TODO: get rid of the polyfill
// required by mutx
require('babel-polyfill');

const buffer = require('buffer');
const co = require('co');
const crypto = require('crypto');
const _ = require('lodash');
const mutx = require('mutx');
const qs = require('qs');
const urlParse = require('url').parse;

const config = require('../../config.json');

const whitelist = [{
  host: /arxiv\.org$/,
  testUrl: true,
}, {
  host: /^oapen.org/,
  testUrl: true,
}, {
  host: /^link\.springer\.com$/,
  testExtractors: ['metaCitationDoi'],
}, {
  host: /sciencedirect\.com$/,
  testExtractors: ['aDoi'],
}];

function getShortNumber(number) {
  if (number < 1e3) return number.toString();
  if (number < 1e6) return `${Math.floor(number / 1e3)}K`;
  if (number < 1e9) return `${Math.floor(number / 1e6)}M`;
  return '>1e9';
}

const getDocumentByRemote = co.wrap(function* getDocumentByRemote(remote) {
  const response =
    yield fetch(`${config.apiUrl}/documents/remote?${qs.stringify(remote)}`);
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Unsuccessful request: ${response.statusText}`);
  return yield response.json();
});

const getDocumentRevisions = co.wrap(function* getDocumentRevisions(docId) {
  const response = yield fetch(`${config.apiUrl}/documents/${docId}/revisions/`);
  if (!response.ok) throw new Error('revisions GET unsuccessful');
  const body = yield response.json();
  return body.revisions;
});

const getDiscussions = co.wrap(function* getDiscussions(documentId) {
  // fetch discussions
  const response =
    yield fetch(`${config.apiUrl}/documents/${documentId}/discussions/`);
  if (!response.ok) throw new Error('discussion GET unsuccessful');
  const body = yield response.json();
  return body.discussions;
});

// ****************************************************************************
// Tab class represents the state of a tab
class Tab {
  constructor(tabId) {
    this.tabId = tabId;
  }

  _updateIcon(color) {
    const prefix = `images/icon-${color ? '' : 'gray-'}`;
    chrome.browserAction.setIcon({
      path: { 19: `${prefix}19.png`, 38: `${prefix}38.png` },
      tabId: this.tabId,
    });
  }

  _updateBadge(number) {
    chrome.browserAction.setBadgeText({
      text: number ? getShortNumber(number) : '',
      tabId: this.tabId,
    });
  }

  _reset() {
    this._updateIcon();
    this._updateBadge();
    delete this.documentData;
  }

  _updateDocument(docId) {
    const self = this;
    return co(function* _updateDocument() {
      // TODO: remove?
      // silently stop processing if no document is given
      // (actual errors are thrown)
      // if (!doc) return;

      // get all revisions and discussions
      const [revisions, discussions] =
        yield [getDocumentRevisions(docId), yield getDiscussions(docId)];

      // save data
      self.documentData = { revisions, discussions };

      // update icon+badge
      self._updateIcon(true);
      self._updateBadge(discussions.length);

      // TODO: do we need this?
      // notify tab
      // responseData(tabId);
    });
  }

  onUrlChange(url) {
    const self = this;
    return co(function* _onUrlChange() {
      self._reset();

      if (!url) return;

      // parse the tab url
      const parsedUrl = urlParse(url);

      // are we on PaperHive?
      if (/paperhive\.org$/.test(parsedUrl.hostname)) {
        // match a document path of the form /documents/<documentId>*
        const matches = /\/documents\/([^\/]+)(?:[\/?].*)?$/
          .exec(parsedUrl.path);
        if (matches) {
          yield self._updateDocument(matches[1]);
          return;
        }
      }

      // don't do anything if the hostname isn't whitelisted.
      const whitelistMatch =
        _.find(whitelist, test => test.host.test(parsedUrl.hostname));
      if (!whitelistMatch) return;

      if (whitelistMatch.testUrl) {
        // let the PaperHive API determine if this URL resolves to a document
        // on PaperHive
        const doc = yield getDocumentByRemote({ type: 'url', id: url });
        if (doc) {
          yield self._updateDocument(doc.id);
          return;
        }
      }
    });
  }

  onCompleted(url) {
    const self = this;
    return co(function* _onCompleted() {
      // do nothing if we already have documentData set
      if (self.documentData) return;

      // parse the tab url
      const parsedUrl = urlParse(url);

      // don't do anything if the hostname isn't whitelisted.
      const whitelistMatch =
        _.find(whitelist, test => test.host.test(parsedUrl.hostname));
      if (!whitelistMatch) return;

      if (whitelistMatch.testExtractors) {
        const remote = yield new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(
            self.tabId,
            {
              command: 'extractRemote',
              data: { extractors: whitelistMatch.testExtractors },
            },
            resolve
          );
        });

        if (remote) {
          const doc = yield getDocumentByRemote(remote);
          yield self._updateDocument(doc.id);
          return;
        }
      }
    });
  }
}

// ****************************************************************************
// state variables

// tabs maps tabIds to Tab instances
const tabs = {};

// tabMutexes maps tabIds to mutexes for guaranteed mutual exclusive access
const tabMutexes = {};

// ****************************************************************************
// in-tab event handlers
// note: event handlers must take care of locking/unlocking

const safeCall = co.wrap(function* safeCall(tabId, methodName, ...args) {
  const unlock = yield tabMutexes[tabId].lock();
  try {
    yield tabs[tabId][methodName].apply(tabs[tabId], args);
  } catch (error) {
    console.error(error);
  }
  unlock();
});

// TODO: use event filters when firefox supports them
// Not supported in Firefox, cf.
// <https://bugzilla.mozilla.org/show_bug.cgi?id=1242522>.
// ,{
//   url: urlFilter,
//   types: ['main_frame'],
// }

// We could actually handle this already at onBeforeNavigate, but Chrome
// appartently redraws the extension icons at that time, too. This way,
// setIcon() would sometimes have no effect. As a workaround, just run this a
// little bit later, namely at onCommitted.
function onUrlChange(details) {
  // Don't do anything if we're not in the main frame or if the tab has not
  // been set up
  if (details.frameId !== 0 || !tabs[details.tabId]) return;

  safeCall(details.tabId, 'onUrlChange', details.url);
}
chrome.webNavigation.onCommitted.addListener(onUrlChange);
try {
  chrome.webNavigation.onHistoryStateUpdated.addListener(onUrlChange);
} catch (error) {
  console.warn('onHistoryStateUpdated unsupported in your browser.');
}

chrome.webNavigation.onCompleted.addListener(details => {
  if (details.frameId !== 0 || !tabs[details.tabId]) return;
  safeCall(details.tabId, 'onCompleted', details.url);
});

// ****************************************************************************
// tab event handlers
function setupTab(tabId) {
  // set up tab only once
  if (tabs[tabId]) return;

  tabs[tabId] = new Tab(tabId);
  tabMutexes[tabId] = new mutx.Mutex();

  // kick off url change
  chrome.tabs.get(tabId, tab => safeCall(tabId, 'onUrlChange', tab.url));
}

function removeTab(tabId) {
  // tab may not be set up
  if (!tabs[tabId]) return;

  // make sure we do not interfere with a running operation
  tabMutexes[tabId].lock().then(unlock => {
    delete tabs[tabId];
    delete tabMutexes[tabId];
    unlock();
  });
}

// setup Tab instance when tab is activated
chrome.tabs.onActivated.addListener(active => setupTab(active.tabId));

// setup Tab instance for existing active tabs
chrome.tabs.query(
  { active: true },
  _tabs => _tabs.forEach(tab => setupTab(tab.id))
);

chrome.tabs.onReplaced.addListener((addedTab, removedTag) => {
  console.log('replace', addedTab, removedTag);
});

// clean up after tab close (wait until all pending actions completed)
chrome.tabs.onRemoved.addListener(tabId => removeTab(tabId));

// ****************************************************************************
// content+popup script communication
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // The tab ID is either in the sender (if a content script sent the
  // request) or in the request.activeTabId (if popup.js sent the request).
  const tabId = request.tabId || sender.tab.id;
  if (!tabId) throw new Error('tab id is missing.');

  const tab = tabs[tabId];
  if (!tab) throw new Error(`tab ${tabId} is not set up.`);

  switch (request.command) {
    case 'getDocumentData':
      sendResponse(tab.documentData);
      break;
    default: console.error(`command ${request.command} not understood`);
  }
});
