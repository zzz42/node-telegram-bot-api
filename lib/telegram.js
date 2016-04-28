'use strict';

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; }

var TelegramBotWebHook = require('./telegramWebHook');
var TelegramBotPolling = require('./telegramPolling');
var debug = require('debug')('node-telegram-bot-api');
var EventEmitter = require('eventemitter3');
var fileType = require('file-type');
var Promise = require('bluebird');
var request = require('request-promise');
var streamedRequest = require('request');
var qs = require('querystring');
var stream = require('stream');
var mime = require('mime');
var path = require('path');
var URL = require('url');
var fs = require('fs');
var pump = require('pump');

var TelegramBot = function (_EventEmitter) {
  _inherits(TelegramBot, _EventEmitter);

  /**
   * Both request method to obtain messages are implemented. To use standard polling, set `polling: true`
   * on `options`. Notice that [webHook](https://core.telegram.org/bots/api#setwebhook) will need a SSL certificate.
   * Emits `message` when a message arrives.
   *
   * @class TelegramBot
   * @constructor
   * @param {String} token Bot Token
   * @param {Object} [options]
   * @param {Boolean|Object} [options.polling=false] Set true to enable polling or set options
   * @param {String|Number} [options.polling.timeout=10] Polling time in seconds
   * @param {String|Number} [options.polling.interval=2000] Interval between requests in miliseconds
   * @param {Boolean|Object} [options.webHook=false] Set true to enable WebHook or set options
   * @param {String} [options.webHook.key] PEM private key to webHook server.
   * @param {String} [options.webHook.cert] PEM certificate (public) to webHook server.
   * @see https://core.telegram.org/bots/api
   */

  function TelegramBot(token) {
    var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

    _classCallCheck(this, TelegramBot);

    var _this = _possibleConstructorReturn(this, Object.getPrototypeOf(TelegramBot).call(this));

    _this.processUpdate = function (update) {
      debug('Process Update %j', update);
      var message = update.message;
      var inlineQuery = update.inline_query;
      var chosenInlineResult = update.chosen_inline_result;

      if (message) {
        debug('Process Update message %j', message);
        _this.emit('message', message);
        var processMessageType = function processMessageType(messageType) {
          if (message[messageType]) {
            debug('Emtting %s: %j', messageType, message);
            _this.emit(messageType, message);
          }
        };
        TelegramBot.messageTypes.forEach(processMessageType);
        if (message.text) {
          debug('Text message');
          _this.textRegexpCallbacks.forEach(function (reg) {
            debug('Matching %s whith', message.text, reg.regexp);
            var result = reg.regexp.exec(message.text);
            if (result) {
              debug('Matches', reg.regexp);
              reg.callback(message, result);
            }
          });
        }
        if (message.reply_to_message) {
          // Only callbacks waiting for this message
          _this.onReplyToMessages.forEach(function (reply) {
            // Message from the same chat
            if (reply.chatId === message.chat.id) {
              // Responding to that message
              if (reply.messageId === message.reply_to_message.message_id) {
                // Resolve the promise
                reply.callback(message);
              }
            }
          });
        }
      } else if (inlineQuery) {
        debug('Process Update inline_query %j', inlineQuery);
        _this.emit('inline_query', inlineQuery);
      } else if (chosenInlineResult) {
        debug('Process Update chosen_inline_result %j', chosenInlineResult);
        _this.emit('chosen_inline_result', chosenInlineResult);
      }
    };

    _this.options = options;
    _this.token = token;
    _this.textRegexpCallbacks = [];
    _this.onReplyToMessages = [];

    if (options.polling) {
      _this.initPolling();
    }

    if (options.webHook) {
      _this._WebHook = new TelegramBotWebHook(token, options.webHook, _this.processUpdate);
    }
    return _this;
  }

  // Telegram message events


  _createClass(TelegramBot, [{
    key: 'initPolling',
    value: function initPolling() {
      if (this._polling) {
        this._polling.abort = true;
        this._polling.lastRequest.cancel('Polling restart');
      }
      this._polling = new TelegramBotPolling(this.token, this.options.polling, this.processUpdate);
    }
  }, {
    key: '_safeParse',


    // used so that other funcs are not non-optimizable
    value: function _safeParse(json) {
      try {
        return JSON.parse(json);
      } catch (err) {
        throw new Error('Error parsing Telegram response: ' + String(json));
      }
    }

    // request-promise

  }, {
    key: '_request',
    value: function _request(_path) {
      var _this2 = this;

      var options = arguments.length <= 1 || arguments[1] === undefined ? {} : arguments[1];

      if (!this.token) {
        throw new Error('Telegram Bot Token not provided!');
      }

      if (options.form) {
        var replyMarkup = options.form.reply_markup;
        if (replyMarkup && typeof replyMarkup !== 'string') {
          // reply_markup must be passed as JSON stringified to Telegram
          options.form.reply_markup = JSON.stringify(replyMarkup);
        }
      }
      options.url = this._buildURL(_path);
      options.simple = false;
      options.resolveWithFullResponse = true;
      debug('HTTP request: %j', options);
      return request(options).then(function (resp) {
        if (resp.statusCode !== 200) {
          throw new Error(resp.statusCode + ' ' + resp.body);
        }

        var data = _this2._safeParse(resp.body);
        if (data.ok) {
          return data.result;
        }

        throw new Error(data.error_code + ' ' + data.description);
      });
    }

    /**
     * Generates url with bot token and provided path/method you want to be got/executed by bot
     * @return {String} url
     * @param {String} path
     * @private
     * @see https://core.telegram.org/bots/api#making-requests
     */

  }, {
    key: '_buildURL',
    value: function _buildURL(_path) {
      return URL.format({
        protocol: 'https',
        host: 'api.telegram.org',
        pathname: '/bot' + this.token + '/' + _path
      });
    }

    /**
     * Returns basic information about the bot in form of a `User` object.
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getme
     */

  }, {
    key: 'getMe',
    value: function getMe() {
      var _path = 'getMe';
      return this._request(_path);
    }

    /**
     * Specify an url to receive incoming updates via an outgoing webHook.
     * @param {String} url URL where Telegram will make HTTP Post. Leave empty to
     * delete webHook.
     * @param {String|stream.Stream} [cert] PEM certificate key (public).
     * @see https://core.telegram.org/bots/api#setwebhook
     */

  }, {
    key: 'setWebHook',
    value: function setWebHook(url, cert) {
      var _path = 'setWebHook';
      var opts = { qs: { url: url } };

      if (cert) {
        var _formatSendData2 = this._formatSendData('certificate', cert);

        var _formatSendData3 = _slicedToArray(_formatSendData2, 2);

        var formData = _formatSendData3[0];
        var certificate = _formatSendData3[1];

        opts.formData = formData;
        opts.qs.certificate = certificate;
      }

      return this._request(_path, opts).then(function (resp) {
        if (!resp) {
          throw new Error(resp);
        }

        return resp;
      });
    }

    /**
     * Use this method to receive incoming updates using long polling
     * @param  {Number|String} [timeout] Timeout in seconds for long polling.
     * @param  {Number|String} [limit] Limits the number of updates to be retrieved.
     * @param  {Number|String} [offset] Identifier of the first update to be returned.
     * @return {Promise} Updates
     * @see https://core.telegram.org/bots/api#getupdates
     */

  }, {
    key: 'getUpdates',
    value: function getUpdates(timeout, limit, offset) {
      var form = {
        offset: offset,
        limit: limit,
        timeout: timeout
      };

      return this._request('getUpdates', { form: form });
    }

    /**
     * Send text message.
     * @param  {Number|String} chatId Unique identifier for the message recipient
     * @param  {String} text Text of the message to be sent
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendmessage
     */

  }, {
    key: 'sendMessage',
    value: function sendMessage(chatId, text) {
      var form = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      form.chat_id = chatId;
      form.text = text;
      return this._request('sendMessage', { form: form });
    }

    /**
     * Send answers to an inline query.
     * @param  {String} inlineQueryId Unique identifier of the query
     * @param  {InlineQueryResult[]} results An array of results for the inline query
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#answerinlinequery
     */

  }, {
    key: 'answerInlineQuery',
    value: function answerInlineQuery(inlineQueryId, results) {
      var form = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      form.inline_query_id = inlineQueryId;
      form.results = JSON.stringify(results);
      return this._request('answerInlineQuery', { form: form });
    }

    /**
     * Forward messages of any kind.
     * @param  {Number|String} chatId     Unique identifier for the message recipient
     * @param  {Number|String} fromChatId Unique identifier for the chat where the
     * original message was sent
     * @param  {Number|String} messageId  Unique message identifier
     * @return {Promise}
     */

  }, {
    key: 'forwardMessage',
    value: function forwardMessage(chatId, fromChatId, messageId) {
      var form = {
        chat_id: chatId,
        from_chat_id: fromChatId,
        message_id: messageId
      };

      return this._request('forwardMessage', { form: form });
    }
  }, {
    key: '_formatSendData',
    value: function _formatSendData(type, data) {
      var formData = void 0;
      var fileName = void 0;
      var fileId = void 0;
      if (data instanceof stream.Stream) {
        fileName = URL.parse(path.basename(data.path)).pathname;
        formData = {};
        formData[type] = {
          value: data,
          options: {
            filename: qs.unescape(fileName),
            contentType: mime.lookup(fileName)
          }
        };
      } else if (Buffer.isBuffer(data)) {
        var filetype = fileType(data);
        if (!filetype) {
          throw new Error('Unsupported Buffer file type');
        }
        formData = {};
        formData[type] = {
          value: data,
          options: {
            filename: 'data.' + filetype.ext,
            contentType: filetype.mime
          }
        };
      } else if (fs.existsSync(data)) {
        fileName = path.basename(data);
        formData = {};
        formData[type] = {
          value: fs.createReadStream(data),
          options: {
            filename: fileName,
            contentType: mime.lookup(fileName)
          }
        };
      } else {
        fileId = data;
      }
      return [formData, fileId];
    }

    /**
     * Send photo
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} photo A file path or a Stream. Can
     * also be a `file_id` previously uploaded
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendphoto
     */

  }, {
    key: 'sendPhoto',
    value: function sendPhoto(chatId, photo) {
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      var opts = {
        qs: options
      };
      opts.qs.chat_id = chatId;
      var content = this._formatSendData('photo', photo);
      opts.formData = content[0];
      opts.qs.photo = content[1];
      return this._request('sendPhoto', opts);
    }

    /**
     * Send audio
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} audio A file path, Stream or Buffer.
     * Can also be a `file_id` previously uploaded.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendaudio
     */

  }, {
    key: 'sendAudio',
    value: function sendAudio(chatId, audio) {
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      var opts = {
        qs: options
      };
      opts.qs.chat_id = chatId;
      var content = this._formatSendData('audio', audio);
      opts.formData = content[0];
      opts.qs.audio = content[1];
      return this._request('sendAudio', opts);
    }

    /**
     * Send Document
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} doc A file path, Stream or Buffer.
     * Can also be a `file_id` previously uploaded.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendDocument
     */

  }, {
    key: 'sendDocument',
    value: function sendDocument(chatId, doc) {
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      var opts = {
        qs: options
      };
      opts.qs.chat_id = chatId;
      var content = this._formatSendData('document', doc);
      opts.formData = content[0];
      opts.qs.document = content[1];
      return this._request('sendDocument', opts);
    }

    /**
     * Send .webp stickers.
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} sticker A file path, Stream or Buffer.
     * Can also be a `file_id` previously uploaded. Stickers are WebP format files.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendsticker
     */

  }, {
    key: 'sendSticker',
    value: function sendSticker(chatId, sticker) {
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      var opts = {
        qs: options
      };
      opts.qs.chat_id = chatId;
      var content = this._formatSendData('sticker', sticker);
      opts.formData = content[0];
      opts.qs.sticker = content[1];
      return this._request('sendSticker', opts);
    }

    /**
     * Use this method to send video files, Telegram clients support mp4 videos (other formats may be sent as Document).
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} video A file path or Stream.
     * Can also be a `file_id` previously uploaded.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendvideo
     */

  }, {
    key: 'sendVideo',
    value: function sendVideo(chatId, video) {
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      var opts = {
        qs: options
      };
      opts.qs.chat_id = chatId;
      var content = this._formatSendData('video', video);
      opts.formData = content[0];
      opts.qs.video = content[1];
      return this._request('sendVideo', opts);
    }

    /**
     * Send voice
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String|stream.Stream|Buffer} voice A file path, Stream or Buffer.
     * Can also be a `file_id` previously uploaded.
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendvoice
     */

  }, {
    key: 'sendVoice',
    value: function sendVoice(chatId, voice) {
      var options = arguments.length <= 2 || arguments[2] === undefined ? {} : arguments[2];

      var opts = {
        qs: options
      };
      opts.qs.chat_id = chatId;
      var content = this._formatSendData('voice', voice);
      opts.formData = content[0];
      opts.qs.voice = content[1];
      return this._request('sendVoice', opts);
    }

    /**
     * Send chat action.
     * `typing` for text messages,
     * `upload_photo` for photos, `record_video` or `upload_video` for videos,
     * `record_audio` or `upload_audio` for audio files, `upload_document` for general files,
     * `find_location` for location data.
     *
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {String} action Type of action to broadcast.
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendchataction
     */

  }, {
    key: 'sendChatAction',
    value: function sendChatAction(chatId, action) {
      var form = {
        action: action,
        chat_id: chatId
      };
      return this._request('sendChatAction', { form: form });
    }

    /**
     * Use this method to get a list of profile pictures for a user.
     * Returns a [UserProfilePhotos](https://core.telegram.org/bots/api#userprofilephotos) object.
     *
     * @param  {Number|String} userId  Unique identifier of the target user
     * @param  {Number} [offset] Sequential number of the first photo to be returned. By default, all photos are returned.
     * @param  {Number} [limit] Limits the number of photos to be retrieved. Values between 1—100 are accepted. Defaults to 100.
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getuserprofilephotos
     */

  }, {
    key: 'getUserProfilePhotos',
    value: function getUserProfilePhotos(userId, offset, limit) {
      var form = {
        user_id: userId,
        offset: offset,
        limit: limit
      };
      return this._request('getUserProfilePhotos', { form: form });
    }

    /**
     * Send location.
     * Use this method to send point on the map.
     *
     * @param  {Number|String} chatId  Unique identifier for the message recipient
     * @param  {Float} latitude Latitude of location
     * @param  {Float} longitude Longitude of location
     * @param  {Object} [options] Additional Telegram query options
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#sendlocation
     */

  }, {
    key: 'sendLocation',
    value: function sendLocation(chatId, latitude, longitude) {
      var form = arguments.length <= 3 || arguments[3] === undefined ? {} : arguments[3];

      form.chat_id = chatId;
      form.latitude = latitude;
      form.longitude = longitude;
      return this._request('sendLocation', { form: form });
    }

    /**
     * Get file.
     * Use this method to get basic info about a file and prepare it for downloading.
     * Attention: link will be valid for 1 hour.
     *
     * @param  {String} fileId  File identifier to get info about
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#getfile
     */

  }, {
    key: 'getFile',
    value: function getFile(fileId) {
      var form = { file_id: fileId };
      return this._request('getFile', { form: form });
    }

    /**
     * Get link for file.
     * Use this method to get link for file for subsequent use.
     * Attention: link will be valid for 1 hour.
     *
     * This method is a sugar extension of the (getFile)[#getfilefileid] method,
     * which returns just path to file on remote server (you will have to manually build full uri after that).
     *
     * @param  {String} fileId  File identifier to get info about
     * @return {Promise} promise Promise which will have *fileURI* in resolve callback
     * @see https://core.telegram.org/bots/api#getfile
     */

  }, {
    key: 'getFileLink',
    value: function getFileLink(fileId) {
      var _this3 = this;

      return this.getFile(fileId).then(function (resp) {
        return URL.format({
          protocol: 'https',
          host: 'api.telegram.org',
          pathname: '/file/bot' + _this3.token + '/' + resp.file_path
        });
      });
    }

    /**
     * Downloads file in the specified folder.
     * This is just a sugar for (getFile)[#getfilefiled] method
     *
     * @param  {String} fileId  File identifier to get info about
     * @param  {String} downloadDir Absolute path to the folder in which file will be saved
     * @return {Promise} promise Promise, which will have *filePath* of downloaded file in resolve callback
     */

  }, {
    key: 'downloadFile',
    value: function downloadFile(fileId, downloadDir) {
      return this.getFileLink(fileId).then(function (fileURI) {
        var fileName = fileURI.slice(fileURI.lastIndexOf('/') + 1);
        // TODO: Ensure fileName doesn't contains slashes
        var filePath = downloadDir + '/' + fileName;

        // properly handles errors and closes all streams
        return Promise.fromCallback(function (next) {
          pump(streamedRequest({ uri: fileURI }), fs.createWriteStream(filePath), next);
        }).return(filePath);
      });
    }

    /**
     * Kick a user from a group or a supergroup.
     * Returns True on success.
     *
     * @param  {Number|String} chatId  Unique identifier for the target group or username of the target supergroup
     * @param  {String} userId  Unique identifier for the target group or username of the target supergroup (in the format @supergroupusername)
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#kickchatmember
     */

  }, {
    key: 'kickChatMember',
    value: function kickChatMember(chatId, userId) {
      var form = {
        chat_id: chatId,
        user_id: userId
      };
      return this._request('kickChatMember', { form: form });
    }

    /**
     * Unban a previously kicked user in a supergroup.
     * Returns True on success.
     * 
     * @param  {Number|String} chatId  Unique identifier for the target group or username of the target supergroup (in the format @supergroupusername)
     * @param  {String} userId  Unique identifier of the target user
     * @return {Promise}
     * @see https://core.telegram.org/bots/api#unbanchatmember
     */

  }, {
    key: 'unbanChatMember',
    value: function unbanChatMember(chatId, userId) {
      var form = {
        chat_id: chatId,
        user_id: userId
      };
      return this._request('unbanChatMember', { form: form });
    }

    /**
     * Register a RegExp to test against an incomming text message.
     * @param  {RegExp}   regexp       RegExp to be executed with `exec`.
     * @param  {Function} callback     Callback will be called with 2 parameters,
     * the `msg` and the result of executing `regexp.exec` on message text.
     */

  }, {
    key: 'onText',
    value: function onText(regexp, callback) {
      this.textRegexpCallbacks.push({ regexp: regexp, callback: callback });
    }

    /**
     * Register a reply to wait for a message response.
     * @param  {Number|String}   chatId       The chat id where the message cames from.
     * @param  {Number|String}   messageId    The message id to be replied.
     * @param  {Function} callback     Callback will be called with the reply
     * message.
     */

  }, {
    key: 'onReplyToMessage',
    value: function onReplyToMessage(chatId, messageId, callback) {
      this.onReplyToMessages.push({
        chatId: chatId,
        messageId: messageId,
        callback: callback
      });
    }
  }]);

  return TelegramBot;
}(EventEmitter);

TelegramBot.messageTypes = ['text', 'audio', 'document', 'photo', 'sticker', 'video', 'voice', 'contact', 'location', 'new_chat_participant', 'left_chat_participant', 'new_chat_title', 'new_chat_photo', 'delete_chat_photo', 'group_chat_created'];


module.exports = TelegramBot;