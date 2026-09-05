/**
 * js/p2p-sync.js - Module Truyền Dữ Liệu P2P Siêu Tốc (WebRTC DataChannel)
 * Kết nối trực tiếp giữa 2 thiết bị (Mobile <-> Mobile hoặc Desktop <-> Mobile)
 * Quét 1 mã kết nối duy nhất trong 0.01s, sau đó bắn toàn bộ dữ liệu qua sóng trong 0.05s!
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.P2PSync = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var PREFIX_P2P = 'GHNP2P:';
  var currentPeer = null;
  var currentConn = null;

  function getPeerConstructor() {
    if (typeof Peer !== 'undefined') return Peer;
    if (typeof window !== 'undefined' && window.Peer) return window.Peer;
    if (typeof global !== 'undefined' && global.Peer) return global.Peer;
    return null;
  }

  function generatePin() {
    // Sinh mã PIN 6 chữ số dễ nhớ (VD: 829104)
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function formatPeerId(pin) {
    return 'ghn-sync-' + pin;
  }

  function extractPinFromId(peerId) {
    if (!peerId) return '';
    return String(peerId).replace(/^ghn-sync-/, '');
  }

  var P2PSync = {
    PREFIX_P2P: PREFIX_P2P,

    /**
     * Kiểm tra xem văn bản quét được có phải là mã kết nối P2P không
     */
    isP2PQR: function(text) {
      if (!text || typeof text !== 'string') return false;
      var trimmed = text.trim();
      return trimmed.indexOf(PREFIX_P2P) === 0 || trimmed.indexOf('ghn-sync-') === 0;
    },

    /**
     * Lấy Peer ID từ mã quét được
     */
    parseP2PQR: function(text) {
      if (!text || typeof text !== 'string') return '';
      var trimmed = text.trim();
      if (trimmed.indexOf(PREFIX_P2P) === 0) {
        return trimmed.substring(PREFIX_P2P.length).trim();
      }
      return trimmed;
    },

    /**
     * Hiển thị mã QR kết nối P2P (mã cực nhỏ thưa, quét ngay lập tức)
     */
    renderP2PQR: function(container, text, options) {
      if (!container) return;
      options = options || {};
      var cellSize = options.cellSize || 5;
      var margin = options.margin || 2;

      var qrsync = (typeof window !== 'undefined' && window.QRSync) || (typeof QRSync !== 'undefined' ? QRSync : null);
      if (qrsync && qrsync.renderQR) {
        qrsync.renderQR(container, text, { cellSize: cellSize, margin: margin });
      } else if (typeof QRCode !== 'undefined') {
        try {
          container.innerHTML = '';
          new QRCode(container, {
            text: text,
            width: 220,
            height: 220,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: 'L'
          });
        } catch(e) {
          console.error('Lỗi render QR P2P:', e);
          container.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:15px; text-align:center;">Lỗi tạo mã: ' + (e.message || e) + '</div>';
        }
      }
    },

    /**
     * Tạo Payload cho chế độ Patch (Tọa độ & Nhóm)
     */
    buildPatchPayload: function(orders, groups, verifiedGeocache) {
      var cleanGroups = (groups || []).filter(function(g) {
        return g && g.id && g.id !== 'group_ungrouped';
      }).map(function(g) {
        return [g.id, g.name || ''];
      });

      var grpMap = {};
      cleanGroups.forEach(function(item, idx) {
        grpMap[item[0]] = idx;
      });

      var patches = [];
      (orders || []).forEach(function(o) {
        var idKey = o.trackingCode || o.id;
        if (!idKey) return;
        var lat = (o.lat != null && !isNaN(o.lat)) ? Number(Number(o.lat).toFixed(5)) : null;
        var lng = (o.lng != null && !isNaN(o.lng)) ? Number(Number(o.lng).toFixed(5)) : null;
        if (lat == null && verifiedGeocache && o.address) {
          var normAddr = o.address.toLowerCase().trim();
          var cached = verifiedGeocache[normAddr] || verifiedGeocache[o.address];
          if (cached && cached.lat != null && cached.lng != null) {
            lat = Number(Number(cached.lat).toFixed(5));
            lng = Number(Number(cached.lng).toFixed(5));
          }
        }
        var grpIdx = (o.groupId && grpMap[o.groupId] !== undefined) ? grpMap[o.groupId] : '';
        patches.push([idKey, grpIdx, lat, lng]);
      });

      return {
        type: 'ghn_p2p_sync',
        mode: 'patch',
        timestamp: Date.now(),
        payload: {
          v: 2,
          t: 'patch',
          g: cleanGroups,
          p: patches
        },
        verifiedGeocache: verifiedGeocache || {}
      };
    },

    /**
     * Tạo Payload cho chế độ Full (Toàn bộ đơn hàng & Nhóm)
     */
    buildFullPayload: function(orders, groups, verifiedGeocache) {
      var cleanGroups = (groups || []).filter(function(g) {
        return g && g.id && g.id !== 'group_ungrouped';
      }).map(function(g) {
        return [g.id, g.name || ''];
      });

      var grpMap = {};
      cleanGroups.forEach(function(item, idx) {
        grpMap[item[0]] = idx;
      });

      var compactOrders = (orders || []).map(function(o) {
        var grpIdx = (o.groupId && grpMap[o.groupId] !== undefined) ? grpMap[o.groupId] : '';
        var lat = (o.lat != null && !isNaN(o.lat)) ? Number(Number(o.lat).toFixed(5)) : null;
        var lng = (o.lng != null && !isNaN(o.lng)) ? Number(Number(o.lng).toFixed(5)) : null;
        return [
          o.trackingCode || '',
          o.customerName || '',
          o.phone || '',
          o.address || '',
          Number(o.codAmount) || 0,
          (o.status && o.status !== 'pending') ? o.status : '',
          grpIdx,
          lat,
          lng,
          o.tripCode || ''
        ];
      });

      return {
        type: 'ghn_p2p_sync',
        mode: 'full',
        timestamp: Date.now(),
        payload: {
          v: 2,
          t: 'full',
          g: cleanGroups,
          o: compactOrders
        },
        verifiedGeocache: verifiedGeocache || {}
      };
    },

    /**
     * Khởi tạo Máy Gửi (Host)
     * @param {Object} options - callbacks: onReady, onConnecting, onConnected, onSent, onError, onClose
     * @returns {Object} hostController
     */
    createHost: function(options) {
      this.disconnect();
      options = options || {};

      var PeerClass = getPeerConstructor();
      if (!PeerClass) {
        if (options.onError) options.onError(new Error('Thư viện PeerJS chưa được nạp. Hãy kiểm tra kết nối mạng!'));
        return null;
      }

      var pin = options.pin || generatePin();
      var peerId = formatPeerId(pin);
      var qrPayload = PREFIX_P2P + peerId;

      var peerConfig = {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      };

      try {
        currentPeer = new PeerClass(peerId, peerConfig);
      } catch (err) {
        if (options.onError) options.onError(err);
        return null;
      }

      currentPeer.on('open', function(id) {
        if (options.onReady) {
          options.onReady({
            pin: pin,
            qrToken: qrPayload,
            peerId: id
          });
        }
      });

      currentPeer.on('connection', function(conn) {
        currentConn = conn;
        if (options.onConnecting) options.onConnecting(conn);
        if (options.onClientConnected) options.onClientConnected(conn);

        conn.on('open', function() {
          if (options.onConnected) options.onConnected(conn);
          if (options.onOpen) options.onOpen(conn);
        });

        conn.on('error', function(err) {
          console.warn('Lỗi kết nối P2P Client:', err);
          if (options.onError) options.onError(err);
        });

        conn.on('close', function() {
          if (options.onClose) options.onClose();
        });
      });

      currentPeer.on('error', function(err) {
        console.warn('Lỗi P2P Host:', err);
        if (options.onError) options.onError(err);
      });

      var sendFunc = function(data) {
        if (currentConn && currentConn.open) {
          currentConn.send(data);
          if (options.onSent) options.onSent(data);
          if (options.onDataSent) options.onDataSent(data);
          return true;
        }
        return false;
      };

      return {
        peer: currentPeer,
        pin: pin,
        peerId: peerId,
        send: sendFunc,
        sendData: sendFunc,
        close: function() {
          P2PSync.disconnect();
        },
        destroy: function() {
          P2PSync.disconnect();
        }
      };
    },

    /**
     * Kết nối tới Máy Gửi từ Máy Nhận (Client)
     * @param {string} targetPinOrPeerId - Mã PIN 6 số hoặc Peer ID đầy đủ
     * @param {Object} options - callbacks: onConnecting, onConnected, onData, onDataReceived, onError, onClose
     */
    connectToHost: function(targetPinOrPeerId, options) {
      this.disconnect();
      options = options || {};

      var PeerClass = getPeerConstructor();
      if (!PeerClass) {
        if (options.onError) options.onError(new Error('Thư viện PeerJS chưa được nạp.'));
        return null;
      }

      var raw = String(targetPinOrPeerId || '').trim();
      var peerId = raw.indexOf('ghn-sync-') === 0 ? raw : formatPeerId(raw);

      var clientPeerConfig = {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      };

      try {
        currentPeer = new PeerClass(null, clientPeerConfig);
      } catch (err) {
        if (options.onError) options.onError(err);
        return null;
      }

      if (options.onConnecting) options.onConnecting(peerId);

      currentPeer.on('open', function() {
        var conn = currentPeer.connect(peerId, { reliable: true });
        currentConn = conn;

        conn.on('open', function() {
          if (options.onConnected) options.onConnected(conn);
        });

        conn.on('data', function(data) {
          if (options.onData) options.onData(data);
          if (options.onDataReceived) options.onDataReceived(data);
        });

        conn.on('error', function(err) {
          console.warn('Lỗi kênh kết nối P2P:', err);
          if (options.onError) options.onError(err);
        });

        conn.on('close', function() {
          if (options.onClose) options.onClose();
        });
      });

      currentPeer.on('error', function(err) {
        console.warn('Lỗi kết nối P2P:', err);
        var msg = 'Không thể kết nối tới máy kia (' + (err.type || err.message || err) + '). Hãy đảm bảo cả 2 máy đều có mạng và máy A đang mở mã!';
        if (options.onError) options.onError(new Error(msg));
      });

      return {
        peer: currentPeer,
        close: function() {
          P2PSync.disconnect();
        },
        destroy: function() {
          P2PSync.disconnect();
        }
      };
    },

    /**
     * Ngắt mọi kết nối P2P hiện có
     */
    disconnect: function() {
      if (currentConn) {
        try { currentConn.close(); } catch(e) {}
        currentConn = null;
      }
      if (currentPeer) {
        try { currentPeer.destroy(); } catch(e) {}
        currentPeer = null;
      }
    }
  };

  return P2PSync;
});
