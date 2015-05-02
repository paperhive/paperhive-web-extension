'use strict';

(function() {

  chrome.runtime.onMessage.addListener(
    function(request) {
      console.log(request.discussions);
      if (request.discussions) {
        var elemDiv = document.createElement('div');
        elemDiv.className = 'ph-notification-box';
        var text;
        if (request.discussions.length === 1) {
          text = 'There is <strong>1</strong> discussion for this PDF.';
        } else if (request.discussions.length > 1) {
          text = 'There are <strong>' + request.discussions.length +
            '</strong> discussions for this PDF.';
        }
        //var content = document.createTextNode(text);
        //elemDiv.appendChild(content);
        elemDiv.innerHTML = elemDiv.innerHTML + text;

        document.body.appendChild(elemDiv);
      }
    });

})();
