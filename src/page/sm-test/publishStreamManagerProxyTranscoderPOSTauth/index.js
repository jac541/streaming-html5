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
(function(window, document, red5prosdk) {
  'use strict';

  var serverSettings = (function() {
    var settings = sessionStorage.getItem('r5proServerSettings');
    try {
      return JSON.parse(settings);
    }
    catch (e) {
      console.error('Could not read server settings from sessionstorage: ' + e.message);
    }
    return {};
  })();

  var configuration = (function () {
    var conf = sessionStorage.getItem('r5proTestBed');
    try {
      return JSON.parse(conf);
    }
    catch (e) {
      console.error('Could not read testbed configuration from sessionstorage: ' + e.message);
    }
    return {}
  })();
  red5prosdk.setLogLevel(configuration.verboseLogging ? red5prosdk.LOG_LEVELS.TRACE : red5prosdk.LOG_LEVELS.WARN);

  var targetPublisher;
  var transcoderManifest;
  var selectedTranscoderToPublish;

  var updateStatusFromEvent = window.red5proHandlePublisherEvent; // defined in src/template/partial/status-field-publisher.hbs
  var streamTitle = document.getElementById('stream-title');
  var statisticsField = document.getElementById('statistics-field');
  var addressField = document.getElementById('address-field');
  var bitrateField = document.getElementById('bitrate-field');
  var packetsField = document.getElementById('packets-field');
  var resolutionField = document.getElementById('resolution-field');
  var submitButton = document.getElementById('submit-button');
  var transcoderTypes = ['high', 'mid', 'low'];
  var transcoderForms = (function (types) {
    var list = [];
    var i, length = types.length;
    for (i = 0; i < length; i++) {
      list.push(document.getElementById(['transcoder', types[i]].join('-')));
    }
    return list;
  })(transcoderTypes);
  var qualityContainer = document.getElementById('quality-container');
  var qualitySelect = document.getElementById('quality-select');
  var qualitySubmit = document.getElementById('quality-submit');

  submitButton.addEventListener('click', submitTranscode);
  streamTitle.innerText = configuration.stream1;

  function setQualitySubmitState (isPublishing) {
    if (isPublishing) {
      qualitySubmit.removeEventListener('click', setQualityAndPublish, false);
      qualitySubmit.innerText = 'Stop Publishing';
      qualitySubmit.addEventListener('click', unpublish, false);
    } else {
      qualitySubmit.removeEventListener('click', unpublish, false);
      qualitySubmit.innerText = 'Start Publishing';
      qualitySubmit.addEventListener('click', setQualityAndPublish, false);
    }
  }
  setQualitySubmitState(false);

  var protocol = serverSettings.protocol;
  var isSecure = protocol == 'https';
  function getSocketLocationFromProtocol () {
    return !isSecure
      ? {protocol: 'ws', port: serverSettings.wsport}
      : {protocol: 'wss', port: serverSettings.wssport};
  }

  streamTitle.innerText = configuration.stream1;
  var defaultConfiguration = {
    protocol: getSocketLocationFromProtocol().protocol,
    port: getSocketLocationFromProtocol().port,
    streamMode: configuration.recordBroadcast ? 'record' : 'live',
    bandwidth: {
      video: 1000
    }
  };

  var accessToken = configuration.streamManagerAccessToken;
  var auth = configuration.authentication;
  var authName = auth.enabled ? auth.username : '';
  var authPass = auth.enabled ? auth.password : '';
  var authToken = (auth.enabled && !window.isEmpty(auth.token)) ? auth.token : undefined;
  var transcoderPOST = {
    meta: {
      authentication: {
        username: authName,
        password: authPass,
        token: authToken
      },
      stream: [],
      georules: {
        regions: ['US', 'UK'],
        restricted: false
      },
      qos: 3
    }
  }

  function getAuthenticationParams () {
    var auth = configuration.authentication;
    var authToken = (auth.enabled && !window.isEmpty(auth.token)) ? auth.token : undefined
    var params = {}
    if (auth && auth.enabled) {
      params = {
        connectionParams: {
          username: auth.username,
          password: auth.password,
          token: auth.token
        }
      }
      if (authToken) {
        params.connectionParams.token = authToken
      }
    }
    return params
  }

  function displayServerAddress (serverAddress, proxyAddress) {
    proxyAddress = (typeof proxyAddress === 'undefined') ? 'N/A' : proxyAddress;
    addressField.innerText = ' Proxy Address: ' + proxyAddress + ' | ' + ' Transcoder Address: ' + serverAddress;
  }

  var bitrate = 0;
  var packetsSent = 0;
  var frameWidth = 0;
  var frameHeight = 0;

  function updateStatistics (b, p, w, h) {
    statisticsField.classList.remove('hidden');
    bitrateField.innerText = b === 0 ? 'N/A' : Math.floor(b);
    packetsField.innerText = p;
    resolutionField.innerText = (w || 0) + 'x' + (h || 0);
  }

  function onBitrateUpdate (b, p) {
    bitrate = b;
    packetsSent = p;
    updateStatistics(bitrate, packetsSent, frameWidth, frameHeight);
  }

  function onResolutionUpdate (w, h) {
    frameWidth = w;
    frameHeight = h;
    updateStatistics(bitrate, packetsSent, frameWidth, frameHeight);
  }

  function onPublisherEvent (event) {
    console.log('[Red5ProPublisher] ' + event.type + '.');
    updateStatusFromEvent(event);
  }
  function onPublishFail (message) {
    console.error('[Red5ProPublisher] Publish Error :: ' + message);
  }
  function onPublishSuccess (publisher) {
    console.log('[Red5ProPublisher] Publish Complete.');
    setQualitySubmitState(true);
    try {
      var pc = publisher.getPeerConnection();
      var stream = publisher.getMediaStream();
      window.trackBitrate(pc, onBitrateUpdate);
      statisticsField.classList.remove('hidden');
      stream.getVideoTracks().forEach(function (track) {
        var settings = track.getSettings();
        onResolutionUpdate(settings.width, settings.height);
      });
    }
    catch (e) {
      // no tracking for you!
    }
  }
  function onUnpublishFail (message) {
    console.error('[Red5ProPublisher] Unpublish Error :: ' + message);
    setQualitySubmitState(false);
  }
  function onUnpublishSuccess () {
    console.log('[Red5ProPublisher] Unpublish Complete.');
    setQualitySubmitState(false);
  }

  function postTranscode (transcode) {
    var host = configuration.host;
    var app = configuration.app;
    var streamName = configuration.stream1;
    var port = serverSettings.httpport;
    var baseUrl = protocol + '://' + host + ':' + port;
    var apiVersion = configuration.streamManagerAPI || '4.0';
    var url = baseUrl + '/streammanager/api/' + apiVersion + '/admin/event/meta/' + app + '/' + streamName + '?accessToken=' + accessToken;
    return new Promise(function (resolve, reject) {
      fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
        body: JSON.stringify(transcode)
        })
        .then(function (res) {
          if (res.headers.get("content-type") &&
            res.headers.get("content-type").toLowerCase().indexOf("application/json") >= 0) {
              return res.json();
          }
          else {
            throw new TypeError('Could not properly parse response.');
          }
        })
        .then(function (json) {
          resolve(json);
        })
        .catch(function (error) {
            var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2)
            console.error('[PublisherStreamManagerTest] :: Error - Could not POST transcode request. ' + jsonError)
            reject(error)
        });
    });
  }

  function getRegionIfDefined () {
    var region = configuration.streamManagerRegion;
    if (typeof region === 'string' && region.length > 0 && region !== 'undefined') {
      return region;
    }
    return undefined
  }

  function requestOrigin (configuration) {
    var host = configuration.host;
    var app = configuration.app;
    var streamName = configuration.stream1;
    var port = serverSettings.httpport;
    var baseUrl = protocol + '://' + host + ':' + port;
    var apiVersion = configuration.streamManagerAPI || '4.0';
    var url = baseUrl + '/streammanager/api/' + apiVersion + '/event/' + app + '/' + streamName + '?action=broadcast&transcode=true';
    var region = getRegionIfDefined();
    if (region) {
      url += '&region=' + region;
    }
      return new Promise(function (resolve, reject) {
        fetch(url)
          .then(function (res) {
            if (res.headers.get("content-type") &&
              res.headers.get("content-type").toLowerCase().indexOf("application/json") >= 0) {
                return res.json();
            }
            else {
              throw new TypeError('Could not properly parse response.');
            }
          })
          .then(function (json) {
            resolve(json);
          })
          .catch(function (error) {
            var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2)
            console.error('[PublisherStreamManagerTest] :: Error - Could not request Transcoder IP from Stream Manager. ' + jsonError)
            reject(error)
          });
    });
  }

  function getUserMediaConfiguration (config) {
    return {
      mediaConstraints: {
        audio: configuration.useAudio ? configuration.mediaConstraints.audio : false,
        video: configuration.useVideo ? {
          width: {exact: config.properties.videoWidth},
          height: {exact: config.properties.videoHeight}
        }: false
      }
    };
  }

  function getRTMPMediaConfiguration (config) {
    return {
      mediaConstraints: {
        audio: configuration.useAudio ? configuration.mediaConstraints.audio : false,
        video: configuration.useVideo ? {
                width: config.properties.videoWidth,
                height: config.properties.videoHeight,
                bandwidth: config.properties.videoBR / 1000
              } : false
      }
    }
  }

  function determinePublisher (jsonResponse, transcoderConfig) {
    var host = jsonResponse.serverAddress;
    var app = jsonResponse.scope;
    var name = transcoderConfig.name;
    defaultConfiguration.bandwidth.video = transcoderConfig.properties.videoBR / 1000;
    var config = Object.assign({},
                    configuration,
                    defaultConfiguration,
                    getUserMediaConfiguration(transcoderConfig));
    var rtcConfig = Object.assign({}, config, {
                      protocol: getSocketLocationFromProtocol().protocol,
                      port: getSocketLocationFromProtocol().port,
                      streamName: name,
                      app: configuration.proxy,
                      connectionParams: {
                        host: host,
                        app: app
                      }
                    });
    var rtmpConfig = Object.assign({}, config, {
                      host: host,
                      app: app,
                      protocol: 'rtmp',
                      port: serverSettings.rtmpport,
                      streamName: name,
                      backgroundColor: '#000000',
                      swf: '../../lib/red5pro/red5pro-publisher.swf',
                      swfobjectURL: '../../lib/swfobject/swfobject.js',
                      productInstallURL: '../../lib/swfobject/playerProductInstall.swf'
                    },
                    getAuthenticationParams(),
                    getRTMPMediaConfiguration(transcoderConfig));
    var publishOrder = config.publisherFailoverOrder
                            .split(',')
                            .map(function (item) {
                              return item.trim()
                        });

    // Merge in possible authentication params.
    rtcConfig.connectionParams = Object.assign({},
      getAuthenticationParams().connectionParams,
      rtcConfig.connectionParams);

    if(window.query('view')) {
      publishOrder = [window.query('view')];
    }

    var publisher = new red5prosdk.Red5ProPublisher();
    return publisher.setPublishOrder(publishOrder)
            .init({
                rtc: rtcConfig,
                rtmp: rtmpConfig
              });
  }

  function showAddress (publisher) {
    var config = publisher.getOptions();
    console.log("Host = " + config.host + " | " + "app = " + config.app);
    if (publisher.getType().toLowerCase() === 'rtc') {
      displayServerAddress(config.connectionParams.host, config.host);
      console.log("Using streammanager proxy for rtc");
      console.log("Proxy target = " + config.connectionParams.host + " | " + "Proxy app = " + config.connectionParams.app)
      if(isSecure) {
        console.log("Operating over secure connection | protocol: " + config.protocol + " | port: " +  config.port);
      }
      else {
        console.log("Operating over unsecure connection | protocol: " + config.protocol + " | port: " +  config.port);
      }
    }
    else {
      displayServerAddress(config.host);
    }
  }

  function unpublish () {
    return new Promise(function (resolve, reject) {
      var publisher = targetPublisher;
      publisher.unpublish()
        .then(function () {
          onUnpublishSuccess();
          resolve();
        })
        .catch(function (error) {
          var jsonError = typeof error === 'string' ? error : JSON.stringify(error, 2, null);
          onUnpublishFail('Unmount Error ' + jsonError);
          reject(error);
        });
    });
  }

  var retryCount = 0;
  var retryLimit = 3;
  function respondToOrigin (response) {
    determinePublisher(response, selectedTranscoderToPublish)
      .then(function (publisherImpl) {
        streamTitle.innerText = configuration.stream1;
        targetPublisher = publisherImpl;
        targetPublisher.on('*', onPublisherEvent);
        showAddress(targetPublisher);
        return targetPublisher.publish();
      })
      .then(function () {
        onPublishSuccess(targetPublisher);
      })
      .catch(function (error) {
        var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
        console.error('[Red5ProPublisher] :: Error in access of Transcoder IP: ' + jsonError);
        updateStatusFromEvent({
          type: red5prosdk.PublisherEventTypes.CONNECT_FAILURE
        });
        onPublishFail(jsonError);
      });
  }

  function respondToOriginFailure (error) {
    if (retryCount++ < retryLimit) {
      var retryTimer = setTimeout(function () {
        clearTimeout(retryTimer);
        startup();
      }, 1000);
    }
    else {
      var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
      updateStatusFromEvent({
        type: red5prosdk.PublisherEventTypes.CONNECT_FAILURE
      });
      console.error('[Red5ProPublisher] :: Retry timeout in publishing - ' + jsonError);
    }
  }

  function startup () {
    // Kick off.
    requestOrigin(configuration)
      .then(respondToOrigin)
      .catch(respondToOriginFailure);
  }

  function generateTranscoderPost (streamName, forms) {
    var i = forms.length;
    var formItem;
    var bitrateField;
    var widthField;
    var heightField;
    var setting;
    var streams = [];
    while (--i > -1) {
      formItem = forms[i];
      bitrateField = formItem.getElementsByClassName('bitrate-field')[0];
      widthField = formItem.getElementsByClassName('width-field')[0];
      heightField = formItem.getElementsByClassName('height-field')[0];
      setting = {
        name: [streamName, (i + 1)].join('_'),
        level: (i + 1),
        properties: {
          videoWidth: parseInt(widthField.value, 10),
          videoHeight: parseInt(heightField.value, 10),
          videoBR: parseInt(bitrateField.value, 10)
        }
      }
      streams.push(setting);
    }
    return streams;
  }

  function submitTranscode () {
    var streams = generateTranscoderPost(configuration.stream1, transcoderForms);
    transcoderPOST.meta.stream = streams;
    postTranscode(transcoderPOST)
      .then(function (response) {
        if (response.errorMessage) {
          console.error('[Red5ProPublisher] :: Error in POST of transcode configuration: ' + response.errorMessage);
          if (/Provision already exists/.exec(response.errorMessage)) {
            transcoderManifest = streams;
            qualityContainer.classList.remove('hidden');
          } else {
            updateStatusFromEvent({
              type: red5prosdk.PublisherEventTypes.CONNECT_FAILURE
            });
            onPublishFail(response.errorMessage);
          }
        }
        else {
          transcoderManifest = streams;
          qualityContainer.classList.remove('hidden');
        }
      })
      .catch(function (error) {
        var jsonError = typeof error === 'string' ? error : JSON.stringify(error, null, 2);
        console.error('[Red5ProPublisher] :: Error in POST of transcode configuration: ' + jsonError);
        updateStatusFromEvent({
          type: red5prosdk.PublisherEventTypes.CONNECT_FAILURE
        });
        onPublishFail(jsonError);
      });
  }

  function setQualityAndPublish () {
    var selectedQuality = qualitySelect.value;
    var targetName = [configuration.stream1, selectedQuality].join('_');
    var i = transcoderManifest.length, config;
    while (--i > -1) {
      config = transcoderManifest[i];
      if (config.name === targetName) {
        break;
      }
      config = null;
    }

    if (config) {
      selectedTranscoderToPublish = config;
      startup();
    }
  }

  var shuttingDown = false;
  function shutdown() {
    if (shuttingDown) return;
    shuttingDown = true;
    function clearRefs () {
      if (targetPublisher) {
        targetPublisher.off('*', onPublisherEvent);
      }
      targetPublisher = undefined;
    }
    unpublish().then(clearRefs).catch(clearRefs);
    window.untrackBitrate();
  }
  window.addEventListener('pagehide', shutdown);
  window.addEventListener('beforeunload', shutdown);

})(this, document, window.red5prosdk);
