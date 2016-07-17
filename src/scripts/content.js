'use strict';

const config = require('../../config.json');

const extractors = {
  metaCitationDoi: () => {
    if (!document.head) return undefined;
    const meta = document.head.querySelector('meta[name=citation_doi]');
    if (!meta) return undefined;
    return { type: 'doi', id: meta.content };
  },
  aDoi: () => {
    const a = document.querySelector('a[href*="doi.org/" i]');
    if (!a) return undefined;
    const match = /^https?:\/\/(?:dx\.)?doi\.org\/(.*)$/i.exec(a.href);
    if (!match) return undefined;
    return { type: 'doi', id: match[1] };
  },
  // TODO: prism, highwire, dc (doi, isbn, ...)
};

const defaultExtractorNames = ['metaCitationDoi', 'aDoi'];

function extractRemote(_extractorNames) {
  const extractorNames =
    _extractorNames === 'default' ? defaultExtractorNames : _extractorNames;

  // NOTE: for (const ... of ...) is not yet supported by firefox 48
  let extractorName;
  for (extractorName of extractorNames || defaultExtractorNames) {
    const extractor = extractors[extractorName];
    if (!extractor) throw new Error(`extractor ${extractorName} does not exist`);
    const remote = extractor();
    if (remote) return remote;
  }
  return undefined;
}

// Listen for messages
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.command) {
    case 'extractRemote':
      sendResponse(extractRemote(request.data.extractors));
      break;
    default:
      throw new Error(`command ${request.command} is unknown`);
  }
});
