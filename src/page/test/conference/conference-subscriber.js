/*
Copyright © 2015 Infrared5, Inc. All rights reserved.

The accompanying code comprising examples for use solely in conjunction with Red5 Pro (the "Example Code")
is  licensed  to  you  by  Infrared5  Inc.  in  consideration  of  your  agreement  to  the  following
license terms  and  conditions.  Access,  use,  modification,  or  redistribution  of  the  accompanying
code  constitutes your acceptance of the following license terms and conditions.

Permission is hereby granted, free of charge, to you to use the Example Code and associated documentation
files (collectively, the "Software") without restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
persons to whom the Software is furnished to do so, subject to the following conditions:

The Software shall be used solely in conjunction with Red5 Pro. Red5 Pro is licensed under a separate end
user  license  agreement  (the  "EULA"),  which  must  be  executed  with  Infrared5,  Inc.
An  example  of  the EULA can be found on our website at: https://account.red5pro.com/assets/LICENSE.txt.

The above copyright notice and this license shall be included in all copies or portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,  INCLUDING  BUT
NOT  LIMITED  TO  THE  WARRANTIES  OF  MERCHANTABILITY, FITNESS  FOR  A  PARTICULAR  PURPOSE  AND
NONINFRINGEMENT.   IN  NO  EVENT  SHALL INFRARED5, INC. BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN  AN  ACTION  OF  CONTRACT,  TORT  OR  OTHERWISE,  ARISING  FROM,  OUT  OF  OR  IN CONNECTION
WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/
/**
 * Handles generating and monitoring Subscribers for Conference example.
 */
(function (window, document, red5prosdk) {
  'use strict';

  var isMoz = false;
  if (window.adapter) {
    isMoz = window.adapter.browserDetails.browser.toLowerCase() === 'firefox';
  }

  var subscriberMap = {};
  var ConferenceSubscriberItemMap = {}
  var streamNameField = document.getElementById('streamname-field');
  var updateSuscriberStatusFromEvent = window.red5proHandleSubscriberEvent;
  var subscriberTemplate = '' +
        '<div class="subscriber-session centered">' +
          '<p class="subscriber-status-field">On hold.</p>' +
        '</div>' +
        '<div class="video-holder centered">' +
          '<video autoplay controls playsinline class="red5pro-subscriber red5pro-media red5pro-background"></video>' +
        '</div>' +
        '<div class="audio-holder centered hidden">' +
          '<audio autoplay playsinline class="red5pro-media"></audio>' +
        '</div>' +
        '<div class="centered">' +
          '<p class="subscriber-name-field"></span></p>' +
          '<p class="subscriber-id-field"></span></p>' +
          '</p>' +
        '</div>';

  function templateContent (templateHTML) {
    var div = document.createElement('div');
    div.classList.add('subscriber-container');
    div.innerHTML = templateHTML;
    return div;
  }

  function getSubscriberElementId (streamName) {
    return ['red5pro', 'subscriber', streamName].join('-');
  }

  function getSubscriberElementContainerId (streamName) {
    return [getSubscriberElementId(streamName), 'container'].join('-')
  }

  function getSubscriberAudioElementId (streamName) {
    return ['red5pro', 'subscriber', streamName, 'audio'].join('-');
  }

  function generateNewSubscriberDOM (streamName, subId, parent) {
    var card = templateContent(subscriberTemplate);
    parent.appendChild(card);
    var videoId = getSubscriberElementId(streamName);
    var audioId = getSubscriberAudioElementId(streamName);
    var videoElement = card.getElementsByClassName('red5pro-media')[0];
    var audioElement = card.getElementsByClassName('red5pro-media')[1];
    var subscriberNameField = card.getElementsByClassName('subscriber-name-field')[0];
    var subscriberIdField = card.getElementsByClassName('subscriber-id-field')[0];
    subscriberNameField.innerText = streamName;
    subscriberIdField.innerText = '(' + subId + ')';
    videoElement.id = videoId;
    audioElement.id = audioId;
    card.id = [videoId, 'container'].join('-');
    return card;
  }

  function addAudioSubscriberDecoy (streamName, config, cb) {
    var uid = Math.floor(Math.random() * 0x10000).toString(16);
    var elementId = getSubscriberAudioElementId(streamName);
    var extension = {
      streamName: streamName,
      mediaElementId: elementId,
      subscriptionId: ['subscriber-audio', uid].join('-')
    };
    console.log('[audio:decoy] Adding audio decoy for ' + streamName);
    new red5prosdk.RTCSubscriber()
      .init(Object.assign(config, extension))
      .then(function (aSubscriber) {
        cb(aSubscriber)
        console.log('[audio:decoy] Initialized ' + streamName);
        /*
        aSubscriber.on('*', function (event) {
          console.log('[audio:decoy:' + streamName + ':' + elementId + '] ' + event.type);
        });
        */
        return aSubscriber.subscribe();
      })
      .then(function () {
        console.log('[audio:decoy] Subscribing to ' + streamName);
      })
      .catch(function (error) {
        console.log('[audio:decoy] Error in subscribing to ' + streamName);
        console.log(error);
      });
  }

  function removeAudioSubscriberDecoy (streamName, decoy) {
    console.log('[audio:decoy] Removing audio decoy for ' + streamName);
    decoy.unsubscribe();
  }

  var SubscriberItem = function (subStreamName, parent, index) {
    this.subscriptionId = [streamNameField.value, 'sub'].join('-');
    this.streamName = subStreamName;
    this.subscriber = undefined;
    this.baseConfiguration = undefined;
    this.streamingMode = undefined;
    this.audioDecoy = undefined; // Used when initial mode is `Audio`.
    this.index = index;
    this.next = undefined;
    this.parent = parent;
    this.card = generateNewSubscriberDOM(this.streamName, this.subscriptionId, this.parent);
    this.statusField = this.card.getElementsByClassName('subscriber-status-field')[0];
    this.toggleVideoPoster = this.toggleVideoPoster.bind(this);
    this.handleAudioDecoyVolumeChange = this.handleAudioDecoyVolumeChange.bind(this);
    this.handleStreamingModeMetadata = this.handleStreamingModeMetadata.bind(this);

    this.resetTimout = 0
    this.disposed = false
    ConferenceSubscriberItemMap[this.streamName] = this
  }

  SubscriberItem.prototype.handleAudioDecoyVolumeChange = function (event) {
    if (this.audioDecoy) {
      this.audioDecoy.setVolume(event.data.volume);
    }
  }
  SubscriberItem.prototype.handleStreamingModeMetadata = function (streamingMode) {
    if (isMoz) return; // It works in Firefox!
    var self = this;
    if (this.streamingMode !== streamingMode) {
      var previousStreamingMode = this.streamingMode;
      if (streamingMode === 'Audio' && previousStreamingMode === undefined) {
        // Then, we have started playback of an Audio only stream because
        // the broadcaster has turned off their Camera stream.
        // There is a bug in some browsers that will not allow A/V bundled streams
        // to playback JUST audio on initial subscription in a <video> element; they only allow <audio>.
        addAudioSubscriberDecoy(this.streamName, this.baseConfiguration, function (subscriberInst) {
          self.audioDecoy = subscriberInst;
          self.subscriber.on('Subscribe.Volume.Change', self.handleAudioDecoyVolumeChange);
        });
      } else if (this.audioDecoy) {
        removeAudioSubscriberDecoy(this.streamName, this.audioDecoy);
        this.subscriber.off('Subscribe.Volume.Change', this.handleAudioDecoyVolumeChange)
        this.audioDecoy = undefined;
      }
    }
    this.streamingMode = streamingMode;
  }
  SubscriberItem.prototype.toggleVideoPoster = function (showPoster) {
    var video = document.getElementById(getSubscriberElementId(this.streamName));
    if (showPoster) {
      video.classList.add('hidden');
    } else {
      video.classList.remove('hidden');
    }
  }
  SubscriberItem.prototype.respond = function (event) {
    if (event.type === 'Subscribe.Time.Update') return;

    console.log('TEST', '[subscriber:' + this.streamName + '] ' + event.type);
    var inFailedState = updateSuscriberStatusFromEvent(event, this.statusField);
    if (event.type === 'Subscribe.Metadata') {
      if (event.data.streamingMode) {
        this.toggleVideoPoster(!event.data.streamingMode.match(/Video/));
      }
    } else if (event.type === 'Subscriber.Play.Unpublish') {
      this.dispose()
    } else if (event.type === 'Subscribe.Connection.Closed') {
      this.close()
    } else if (event.type === 'Connect.Failure') {
      this.reject()
      this.close()
    } else if (event.type === 'Subscribe.Fail') {
      this.reject()
      this.close()
    } else if (event.type === 'Subscribe.Start') {
      this.resolve()
    }

    if (inFailedState) {
      this.close();
    }
  }
  SubscriberItem.prototype.resolve = function () {
    if (this.next) {
      this.next.execute(this.baseConfiguration);
    }
  }
  SubscriberItem.prototype.reject = function (event) {
    console.error(event);
    if (this.next) {
      this.next.execute(this.baseConfiguration);
    }
  }
  SubscriberItem.prototype.reset = function () {
    clearTimeout(this.resetTimeout)
    if (this.disposed) return

    this.statusField.innerText = 'Retrying...'
    this.resetTimeout = setTimeout(() => {
      clearTimeout(this.resetTimeout);
      console.log('TEST', '[subscriber:' + this.streamName + '] retry.')
      this.execute(this.baseConfiguration)
    }, 2000)
  }
  SubscriberItem.prototype.dispose = function () {
    clearTimeout(this.resetTimeout)
    this.disposed = true
    this.close()
  }
  SubscriberItem.prototype.close = function () {
    const cleanup = () => {
      this.statusField.innerText = 'Closing...'
      if (!this.disposed) {
        this.reset()
      } else {
        var el = document.getElementById(getSubscriberElementId(this.streamName) + '-container')
        if (el) {
          el.parentNode.removeChild(el);
        }
        console.log('TEST', 'To disposeDD ' + this.streamName)
        delete ConferenceSubscriberItem[this.streamName]
        delete subscriberMap[this.streamName]
      }
    }
    if (this.subscriber) {
      this.subscriber.off('*', this.respond);
      this.subscriber.unsubscribe().then(cleanup).catch(cleanup);
      this.subscriber = undefined
    } else {
      try { cleanup() } catch (e) {}
    }
    if (this.audioDecoy) {
      removeAudioSubscriberDecoy(this.streamName, this.audioDecoy);
    }
  }
  SubscriberItem.prototype.execute = async function (config) {
    clearTimeout(this.resetTimeout)
    this.baseConfiguration = config;
    var self = this;
    var name = this.streamName;
    var uid = Math.floor(Math.random() * 0x10000).toString(16);
    var rtcConfig = Object.assign({}, config, {
                      streamName: name,
                      subscriptionId: [this.subscriptionId, uid].join('-'),
                      mediaElementId: getSubscriberElementId(this.streamName)
    });

    try {
      this.subscriber = new red5prosdk.RTCSubscriber()
      this.subscriber.on('*',  (e) => this.respond(e))

      await this.subscriber.init(rtcConfig)
      subscriberMap[this.streamName] = this.subscriber
      await this.subscriber.subscribe()
      clearTimeout(this.resetTimeout)
    } catch (error) {
      console.log('[subscriber:' + name + '] Error')
      self.reject(error)
      self.close()
    }
  }

  window.getConferenceSubscriberElementContainerId = getSubscriberElementContainerId;
  window.getConferenceSubscriberElementId = getSubscriberElementId;
  window.ConferenceSubscriberItem = SubscriberItem;
  window.ConferenceSubscriberUtil = {
    removeAll: names => {
      while (names.length > 0) {
        let name = names.shift()
        //        console.log('TEST', 'TO shift: ' + name, ConferenceSubscriberItemMap)
        let item = ConferenceSubscriberItemMap[name]
        if (item) {
          item.dispose()
        }
      }
    }
  }

})(window, document, window.red5prosdk);
