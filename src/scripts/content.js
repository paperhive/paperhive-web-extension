'use strict';

(function() {

  var config = require('../../config.json');

  chrome.runtime.sendMessage(
    {
      getInfo: true
    },
    function(response) {
      if (response.article && response.discussions) {
        var elemDiv = document.createElement('div');
        elemDiv.className = 'ph-notification-box';
        var text;
        if (response.discussions.length === 1) {
          text =
            'There is <strong>1</strong> open discussion for this document.';
        } else if (response.discussions.length > 1) {
          text = 'There are <strong>' + response.discussions.length +
            '</strong> open discussions for this document.';
        }
        //var content = document.createTextNode(text);
        //elemDiv.appendChild(content);
        elemDiv.innerHTML = elemDiv.innerHTML +
          '<a target="_blank" href="' +
          config.frontendUrl + '/articles/' + response.article._id +
          '">' +
          text +
          '</a>';

        document.body.appendChild(elemDiv);
      }
    });

})();