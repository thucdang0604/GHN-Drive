/**
 * js/p2p-sync.js - Module Truyền Dữ Liệu P2P Siêu Tốc (WebRTC DataChannel)
 * Kết nối trực tiếp giữa 2 thiết bị (Mobile <-> Mobile hoặc Desktop <-> Mobile)
 * Đồng bộ đơn và truyền ảnh giao hàng theo từng khối nhỏ.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.P2PSync = factory();
  }
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function() {
  'use strict';

  var PREFIX_P2P = 'GHNP2P:';
  var currentPeer = null;
  var currentConn = null;
  var currentConnectTimeout = null;
  var currentConnectCancel = null;
  var photoTransferAssemblies = Object.create(null);
  var PHOTO_CHUNK_SIZE = 32 * 1024;
  var MAX_PHOTO_SIZE = 2 * 1024 * 1024;
  var MAX_PHOTO_TRANSFER_SIZE = 20 * 1024 * 1024;
  var photoTransferSequence = 0;

  function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.slice(0, maxLength || 2000) : '';
  }

  function cleanPhone(value) {
    return cleanText(value, 40).replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '').slice(0, 20);
  }

  function cleanId(value, fallback) {
    return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value.toLowerCase()) ? value : fallback;
  }

  function cleanAmount(value, fallback) {
    var amount = Number(value);
    return Number.isFinite(amount) && amount >= 0 && amount <= 1000000000 ? amount : (fallback || 0);
  }

  function cleanCoordinate(value, min, max) {
    if (value == null || value === '') return null;
    var coordinate = Number(value);
    return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max ? coordinate : null;
  }

  function generateLocalOrderId(index) {
    return 'ghn_sync_' + Date.now() + '_' + index;
  }

  function cleanVerifiedGeocache(cache) {
    if (!cache || typeof cache !== 'object' || Array.isArray(cache)) return {};
    var safe = Object.create(null);
    Object.keys(cache).slice(0, 2000).forEach(function(key) {
      if (['__proto__', 'prototype', 'constructor'].includes(key.toLowerCase())) return;
      var item = cache[key];
      if (!item || typeof item !== 'object') return;
      var lat = cleanCoordinate(item.lat, -90, 90);
      var lng = cleanCoordinate(item.lng, -180, 180);
      if (lat == null || lng == null) return;
      safe[cleanText(key, 300)] = {
        lat: lat,
        lng: lng,
        address: cleanText(item.address, 500),
        updatedAt: cleanText(item.updatedAt, 40)
      };
    });
    return safe;
  }

  function isSafePhotoDataUrl(value) {
    return typeof value === 'string' && value.length <= MAX_PHOTO_SIZE && /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value);
  }

  function applyPhotoChunk(data, orders) {
    if (!data || data.type !== 'ghn_p2p_photo_chunk') return { valid: false, complete: false };
    Object.keys(photoTransferAssemblies).forEach(function(key) {
      if (Date.now() - photoTransferAssemblies[key].startedAt > 120000) delete photoTransferAssemblies[key];
    });
    var orderId = cleanId(data.orderId, '');
    var transferId = cleanId(data.transferId, '');
    var trackingCode = cleanText(data.trackingCode, 100);
    var index = data.index;
    var total = data.total;
    if (!orderId || !transferId || !Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > Math.ceil(MAX_PHOTO_SIZE / PHOTO_CHUNK_SIZE) || index < 0 || index >= total || typeof data.data !== 'string' || data.data.length > PHOTO_CHUNK_SIZE) {
      return { valid: false, complete: false };
    }

    var key = transferId + ':' + orderId + ':' + trackingCode;
    var transfer = photoTransferAssemblies[key];
    if (!transfer) {
      if (Object.keys(photoTransferAssemblies).length >= 8) return { valid: false, complete: false };
      transfer = photoTransferAssemblies[key] = { parts: new Array(total), total: total, size: 0, received: 0, startedAt: Date.now() };
    }
    if (transfer.total !== total) {
      delete photoTransferAssemblies[key];
      return { valid: false, complete: false };
    }
    if (transfer.parts[index] !== undefined) return { valid: true, complete: false };

    transfer.parts[index] = data.data;
    transfer.size += data.data.length;
    transfer.received++;
    if (transfer.size > MAX_PHOTO_SIZE) {
      delete photoTransferAssemblies[key];
      return { valid: false, complete: false };
    }
    if (transfer.received < transfer.total) return { valid: true, complete: false };

    var photo = transfer.parts.join('');
    delete photoTransferAssemblies[key];
    if (!isSafePhotoDataUrl(photo)) return { valid: false, complete: false };
    var order = (orders || []).find(function(item) {
      return item.id === orderId || (trackingCode && String(item.trackingCode || '').toUpperCase() === trackingCode.toUpperCase());
    });
    return { valid: true, complete: true, matched: !!order, order: order || null, photo: photo };
  }

  function sanitizeBackupData(data) {
    if (!data || typeof data !== 'object' || Array.isArray(data) || (!Array.isArray(data.orders) && !Array.isArray(data.groups))) {
      return { valid: false, orders: [], groups: [] };
    }
    var rawOrders = Array.isArray(data.orders) ? data.orders : [];
    var rawGroups = Array.isArray(data.groups) ? data.groups : [];
    if (rawOrders.length > 3000 || rawGroups.length > 500) return { valid: false, orders: [], groups: [] };

    var groupIds = Object.create(null);
    var groupIdMap = Object.create(null);
    var groups = [];
    for (var i = 0; i < rawGroups.length; i++) {
      var sourceGroup = rawGroups[i];
      if (!sourceGroup || typeof sourceGroup !== 'object' || Array.isArray(sourceGroup)) return { valid: false, orders: [], groups: [] };
      var oldGroupId = sourceGroup.id;
      var groupId = cleanId(oldGroupId, 'backup_group_' + i);
      if (groupIds[groupId]) groupId = 'backup_group_' + i;
      while (groupIds[groupId]) groupId += '_';
      groupIds[groupId] = true;
      if (typeof oldGroupId === 'string' && groupIdMap[oldGroupId] === undefined) groupIdMap[oldGroupId] = groupId;
      groups.push({ id: groupId, name: cleanText(sourceGroup.name, 100) || 'Nhóm mới', isCollapsed: !!sourceGroup.isCollapsed });
    }

    var orderIds = Object.create(null);
    var orders = [];
    for (var j = 0; j < rawOrders.length; j++) {
      var sourceOrder = rawOrders[j];
      if (!sourceOrder || typeof sourceOrder !== 'object' || Array.isArray(sourceOrder)) return { valid: false, orders: [], groups: [] };
      var order = {};
      Object.keys(sourceOrder).forEach(function(key) {
        if (['__proto__', 'prototype', 'constructor'].includes(key.toLowerCase())) return;
        Object.defineProperty(order, key, { value: sourceOrder[key], writable: true, enumerable: true, configurable: true });
      });
      var orderId = cleanId(sourceOrder.id, 'ghn_backup_' + Date.now() + '_' + j);
      if (orderIds[orderId]) orderId = 'ghn_backup_' + Date.now() + '_' + j;
      while (orderIds[orderId]) orderId += '_';
      orderIds[orderId] = true;
      order.id = orderId;
      order.trackingCode = cleanText(sourceOrder.trackingCode, 100);
      order.customerName = cleanText(sourceOrder.customerName, 200);
      order.phone = cleanPhone(sourceOrder.phone);
      order.secondaryPhone = cleanPhone(sourceOrder.secondaryPhone);
      order.address = cleanText(sourceOrder.address, 1000);
      order.codAmount = cleanAmount(sourceOrder.codAmount);
      order.phaiThu = cleanAmount(sourceOrder.phaiThu, order.codAmount);
      order.gtbThu = cleanAmount(sourceOrder.gtbThu);
      order.status = ['pending', 'gtc', 'gtb', 'cho_ck'].indexOf(cleanText(sourceOrder.status, 20).toLowerCase()) !== -1 ? sourceOrder.status.toLowerCase() : 'pending';
      order.subStatus = ['cho_ck', 'hen_giao_lai', 'knm', 'tu_choi'].indexOf(cleanText(sourceOrder.subStatus, 40).toLowerCase()) !== -1 ? sourceOrder.subStatus.toLowerCase() : '';
      order.gtbReason = cleanText(sourceOrder.gtbReason, 300);
      order.notes = cleanText(sourceOrder.notes, 1000);
      order.extraNotes = cleanText(sourceOrder.extraNotes, 1000);
      order.tripCode = cleanText(sourceOrder.tripCode, 100);
      order.lat = cleanCoordinate(sourceOrder.lat, -90, 90);
      order.lng = cleanCoordinate(sourceOrder.lng, -180, 180);
      var oldOrderGroupId = typeof sourceOrder.groupId === 'string' ? sourceOrder.groupId : '';
      order.groupId = groupIdMap[oldOrderGroupId] || (oldOrderGroupId === 'group_ungrouped' ? oldOrderGroupId : 'group_ungrouped');
      ['createdAt', 'updatedAt', 'deliveredAt'].forEach(function(key) { order[key] = cleanText(sourceOrder[key], 40); });
      ['outlierReason', 'healedSource', 'healedAlleyLevel'].forEach(function(key) { order[key] = cleanText(sourceOrder[key], 300); });
      order.gpsOutlierDist = cleanAmount(sourceOrder.gpsOutlierDist);
      ['isGpsOutlier', 'isFakeHubCoord', 'isDistrictMismatch', 'isGpsHealed', 'hasHouseNumber', 'hasStoredPhoto'].forEach(function(key) {
        if (sourceOrder[key] !== undefined) order[key] = !!sourceOrder[key];
      });
      var deliveryPhoto = sourceOrder.deliveryPhoto;
      if (typeof deliveryPhoto === 'string' && deliveryPhoto.length <= 8 * 1024 * 1024 && /^data:image\/(?:jpe?g|png|webp);base64,[a-z0-9+/=]+$/i.test(deliveryPhoto)) {
        order.deliveryPhoto = deliveryPhoto;
        order.hasStoredPhoto = true;
      } else if (deliveryPhoto !== undefined) {
        delete order.deliveryPhoto;
      }
      orders.push(order);
    }

    return {
      valid: true,
      orders: orders,
      groups: groups,
      verifiedGeocache: cleanVerifiedGeocache(data.verifiedGeocache),
      importedCount: orders.length
    };
  }

  function getPeerConstructor() {
    if (typeof Peer !== 'undefined') return Peer;
    if (typeof window !== 'undefined' && window.Peer) return window.Peer;
    if (typeof global !== 'undefined' && global.Peer) return global.Peer;
    return null;
  }

  function generatePin() {
    var cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
    if (!cryptoApi || !cryptoApi.getRandomValues) {
      throw new Error('Thiết bị không hỗ trợ tạo mã kết nối an toàn.');
    }
    var bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    return Array.prototype.map.call(bytes, function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
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

    isValidConnectionCode: function(value) {
      return /^(?:ghn-sync-)?(?:\d{6}|[a-f0-9]{32})$/i.test(String(value || '').trim());
    },

    applyPhotoChunk: applyPhotoChunk,

    /**
     * Hiển thị mã QR kết nối P2P (mã cực nhỏ thưa, quét ngay lập tức)
     */
    renderP2PQR: function(container, text, options) {
      if (!container) return false;
      options = options || {};
      var cellSize = options.cellSize || 5;
      var margin = (options.margin !== undefined) ? options.margin : 2;

      var qrEngine = (typeof qrcode !== 'undefined') ? qrcode : (typeof window !== 'undefined' ? window.qrcode : null);
      if (qrEngine) {
        try {
          var qr = qrEngine(0, 'L');
          qr.addData(text);
          qr.make();
          container.innerHTML = qr.createImgTag(cellSize, margin);
          var img = container.querySelector('img');
          if (img) {
            img.style.maxWidth = '100%';
            img.style.maxHeight = '100%';
            img.style.width = '100%';
            img.style.height = 'auto';
            img.style.aspectRatio = '1 / 1';
            img.style.display = 'block';
            img.style.margin = '0 auto';
            img.style.borderRadius = '6px';
            img.style.imageRendering = 'pixelated';
          }
          return true;
        } catch (err) {
          console.warn('Lỗi vẽ QR bằng qrcode:', err);
        }
      }

      if (typeof QRCode !== 'undefined') {
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
          return true;
        } catch(e) {
          console.error('Lỗi render QR P2P:', e);
          container.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:15px; text-align:center;">Lỗi tạo mã: ' + (e.message || e) + '</div>';
          return false;
        }
      }

      container.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:15px; text-align:center;">⚠️ Chưa tải được thư viện QR (js/qrcode.min.js)!</div>';
      return false;
    },

    renderQR: function(container, text, options) {
      return this.renderP2PQR(container, text, options);
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

      var grpMap = Object.create(null);
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
    buildFullPayload: function(orders, groups, verifiedGeocache, groupRules) {
      var cleanGroups = (groups || []).filter(function(g) {
        return g && g.id && g.id !== 'group_ungrouped';
      }).map(function(g) {
        return [g.id, g.name || ''];
      });

      var grpMap = Object.create(null);
      cleanGroups.forEach(function(item, idx) {
        grpMap[item[0]] = idx;
      });

      var photos = [];
      var photoTransferSkipped = 0;
      var totalPhotoSize = 0;
      (orders || []).forEach(function(o) {
        if (!o.deliveryPhoto && !o.hasStoredPhoto) return;
        var orderId = cleanId(o.id, '');
        if (!orderId || !isSafePhotoDataUrl(o.deliveryPhoto) || totalPhotoSize + o.deliveryPhoto.length > MAX_PHOTO_TRANSFER_SIZE || photos.length >= 100) {
          photoTransferSkipped++;
          return;
        }
        totalPhotoSize += o.deliveryPhoto.length;
        photos.push({ orderId: orderId, trackingCode: cleanText(o.trackingCode, 100), photo: o.deliveryPhoto });
      });
      var photoTransferId = photos.length ? 'photo_' + Date.now().toString(36) + '_' + (++photoTransferSequence).toString(36) : '';

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
          o.tripCode || '',
          {
            id: cleanId(o.id, ''),
            phaiThu: cleanAmount(o.phaiThu, o.codAmount),
            gtbThu: cleanAmount(o.gtbThu),
            secondaryPhone: cleanPhone(o.secondaryPhone),
            notes: cleanText(o.notes),
            extraNotes: cleanText(o.extraNotes),
            subStatus: cleanText(o.subStatus, 40),
            gtbReason: cleanText(o.gtbReason, 300),
            createdAt: cleanText(o.createdAt, 40),
            updatedAt: cleanText(o.updatedAt, 40),
            deliveredAt: cleanText(o.deliveredAt, 40),
            outlierReason: cleanText(o.outlierReason, 300),
            gpsOutlierDist: cleanAmount(o.gpsOutlierDist),
            healedSource: cleanText(o.healedSource, 40),
            healedAlleyLevel: cleanText(o.healedAlleyLevel, 100),
            isGpsOutlier: !!o.isGpsOutlier,
            isFakeHubCoord: !!o.isFakeHubCoord,
            isDistrictMismatch: !!o.isDistrictMismatch,
            isGpsHealed: !!o.isGpsHealed
          }
        ];
      });

      return {
        type: 'ghn_p2p_sync',
        mode: 'full',
        timestamp: Date.now(),
        payload: {
          v: 3,
          t: 'full',
          g: cleanGroups,
          o: compactOrders,
          gr: groupRules || []
        },
        photoCount: photos.length,
        photoTransferSkipped: photoTransferSkipped,
        photoTransferId: photoTransferId,
        photos: photos,
        groupRules: groupRules || [],
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

      var pin;
      try {
        pin = options.pin || generatePin();
      } catch (err) {
        if (options.onError) options.onError(err);
        return null;
      }
      var peerId = formatPeerId(pin);
      var qrPayload = PREFIX_P2P + peerId;
      var roomUsed = false;
      var sending = false;

      var peerConfig = {
        // Giữ config mặc định của PeerJS 1.5.4 (STUN + TURN).
        // Tự ghi đè iceServers bằng STUN-only làm một số mạng NAT/firewall không kết nối được.
        debug: 1
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
        if (roomUsed || (currentConn && currentConn.open)) {
          conn.close();
          return;
        }
        currentConn = conn;
        if (options.onConnecting) options.onConnecting(conn);

        conn.on('open', function() {
          if (!options.authorizeConnection || options.authorizeConnection(conn) !== true) {
            if (currentConn === conn) currentConn = null;
            conn.close();
            if (options.onUnauthorized) options.onUnauthorized(conn);
            return;
          }
          if (options.onClientConnected) options.onClientConnected(conn);
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
        var conn = currentConn;
        if (!conn || !conn.open || roomUsed || sending) return false;

        var photos = data && Array.isArray(data.photos) ? data.photos : [];
        var packet = Object.assign({}, data);
        delete packet.photos;
        sending = true;
        try {
          conn.send(packet);
          roomUsed = true;
        } catch (err) {
          sending = false;
          if (options.onError) options.onError(err);
          return false;
        }

        var photoIndex = 0;
        var photoOffset = 0;
        var sendNextPhotoChunk = function() {
          if (!conn.open) {
            sending = false;
            if (options.onError) options.onError(new Error('Kết nối đã đóng trước khi gửi xong ảnh giao hàng.'));
            return;
          }
          if (conn.dataChannel && conn.dataChannel.bufferedAmount > 256 * 1024) {
            setTimeout(sendNextPhotoChunk, 25);
            return;
          }
          if (photoIndex >= photos.length) {
            sending = false;
            if (options.onSent) options.onSent(data);
            if (options.onDataSent) options.onDataSent(data);
            return;
          }

          var photo = photos[photoIndex];
          var total = Math.ceil(photo.photo.length / PHOTO_CHUNK_SIZE);
          var end = Math.min(photoOffset + PHOTO_CHUNK_SIZE, photo.photo.length);
          try {
            conn.send({
              type: 'ghn_p2p_photo_chunk',
              transferId: data.photoTransferId,
              orderId: photo.orderId,
              trackingCode: photo.trackingCode,
              index: Math.floor(photoOffset / PHOTO_CHUNK_SIZE),
              total: total,
              data: photo.photo.slice(photoOffset, end)
            });
          } catch (err) {
            sending = false;
            if (options.onError) options.onError(err);
            return;
          }
          photoOffset = end;
          if (photoOffset >= photo.photo.length) {
            photoIndex++;
            photoOffset = 0;
          }
          setTimeout(sendNextPhotoChunk, 0);
        };

        sendNextPhotoChunk();
        return true;
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
     * @param {string} targetPinOrPeerId - Mã kết nối 32 ký tự hoặc mã 6 số từ phiên bản cũ
     * @param {Object} options - callbacks: onConnecting, onConnected, onData, onDataReceived, onError, onClose
     */
    connectToHost: function(targetPinOrPeerId, options) {
      this.disconnect();
      options = options || {};

      var raw = String(targetPinOrPeerId || '').trim().toLowerCase();
      if (!this.isValidConnectionCode(raw)) {
        if (options.onError) options.onError(new Error('Mã kết nối không hợp lệ.'));
        return null;
      }

      var PeerClass = getPeerConstructor();
      if (!PeerClass) {
        if (options.onError) options.onError(new Error('Thư viện PeerJS chưa được nạp.'));
        return null;
      }

      var peerId = raw.indexOf('ghn-sync-') === 0 ? raw : formatPeerId(raw);

      var clientPeerConfig = {
        // Dùng cùng config mặc định của PeerJS với máy gửi để có TURN relay dự phòng.
        debug: 1
      };

      try {
        currentPeer = new PeerClass(null, clientPeerConfig);
      } catch (err) {
        if (options.onError) options.onError(err);
        return null;
      }

      var peer = currentPeer;
      var finished = false;
      var receivedData = false;
      var timeoutMs = Math.max(10000, Number(options.timeoutMs) || 60000);

      function clearConnectTimeout() {
        if (currentPeer === peer && currentConnectTimeout !== null) {
          clearTimeout(currentConnectTimeout);
          currentConnectTimeout = null;
        }
      }

      function failConnection(err) {
        if (finished) return;
        finished = true;
        currentConnectCancel = null;
        clearConnectTimeout();
        if (options.onError) options.onError(err);
        if (currentPeer === peer) P2PSync.disconnect();
      }

      currentConnectCancel = function() {
        finished = true;
        clearConnectTimeout();
      };

      currentConnectTimeout = setTimeout(function() {
        var err = new Error('Quá ' + Math.round(timeoutMs / 1000) + ' giây chưa nhận được dữ liệu từ Máy A. Hãy tạo PIN mới; nếu vẫn lỗi, thử đổi Wi-Fi/4G vì mạng có thể đang chặn WebRTC.');
        err.type = 'connection-timeout';
        failConnection(err);
      }, timeoutMs);

      peer.on('open', function() {
        if (finished || currentPeer !== peer) return;
        if (options.onConnecting) options.onConnecting(peerId);

        var conn = peer.connect(peerId, { reliable: true });
        currentConn = conn;

        conn.on('open', function() {
          if (finished) return;
          if (options.onConnected) options.onConnected(conn);
        });

        conn.on('data', function(data) {
          receivedData = true;
          if (!finished) {
            finished = true;
            clearConnectTimeout();
          }
          if (options.onData) options.onData(data);
          if (options.onDataReceived) options.onDataReceived(data);
        });

        conn.on('error', function(err) {
          console.warn('Lỗi kênh kết nối P2P:', err);
          failConnection(err);
        });

        conn.on('close', function() {
          if (!finished) {
            var err = new Error('Kết nối với Máy A đã đóng trước khi nhận dữ liệu. Hãy tạo PIN mới và thử lại.');
            err.type = 'connection-closed';
            failConnection(err);
          } else if (receivedData && options.onClose) {
            options.onClose();
          }
        });
      });

      peer.on('error', function(err) {
        console.warn('Lỗi kết nối P2P:', err);
        var msg = 'Không thể kết nối tới máy kia (' + (err.type || err.message || err) + '). Hãy đảm bảo cả 2 máy đều có mạng và máy A đang mở mã!';
        var wrappedError = new Error(msg);
        wrappedError.type = err.type || 'connection-error';
        failConnection(wrappedError);
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
      photoTransferAssemblies = Object.create(null);
      if (currentConnectCancel) {
        var cancelConnect = currentConnectCancel;
        currentConnectCancel = null;
        cancelConnect();
      }
      if (currentConnectTimeout !== null) {
        clearTimeout(currentConnectTimeout);
        currentConnectTimeout = null;
      }
      if (currentConn) {
        try { currentConn.close(); } catch(e) {}
        currentConn = null;
      }
      if (currentPeer) {
        try { currentPeer.destroy(); } catch(e) {}
        currentPeer = null;
      }
    },

    /**
     * Áp dụng gói PATCH (Tọa độ & Gom nhóm) vào danh sách đơn hàng
     */
    applyPatch: function(patchPayload, currentOrders, currentGroups) {
      var updatedOrders = [].concat(currentOrders || []);
      var updatedGroups = [].concat(currentGroups || []);

      if (!patchPayload || !Array.isArray(patchPayload.p) || patchPayload.p.length > 10000 || (patchPayload.g && (!Array.isArray(patchPayload.g) || patchPayload.g.length > 500))) {
        return { valid: false, orders: updatedOrders, groups: updatedGroups, matchedCount: 0 };
      }

      var groupIndexMap = Object.create(null);
      var patchGroups = Array.isArray(patchPayload.g) ? patchPayload.g : [];
      if (patchGroups.length > 0) {
        patchGroups.forEach(function(item, idx) {
          var rawId = Array.isArray(item) ? item[0] : (item && item.id);
          var gId = cleanId(rawId, '');
          var gName = cleanText(Array.isArray(item) ? item[1] : (item && item.name), 100);
          if (gId) {
            groupIndexMap[idx] = gId;
            groupIndexMap[gId] = gId;
            var found = updatedGroups.find(function(g) { return g.id === gId; });
            if (found) {
              found.name = gName || found.name;
            } else {
              updatedGroups.push({ id: gId, name: gName || 'Nhóm mới', isCollapsed: false });
            }
          }
        });
      }

      var matchedCount = 0;
      if (Array.isArray(patchPayload.p)) {
        patchPayload.p.forEach(function(item) {
          if (!Array.isArray(item) || item.length < 4) return;
          var idKey = String(item[0]).trim();
          var rawGrp = item[1];
          var lat = item[2];
          var lng = item[3];

          var resolvedGrpId = 'group_ungrouped';
          if (rawGrp !== '' && rawGrp != null) {
            if (groupIndexMap[rawGrp]) {
              resolvedGrpId = groupIndexMap[rawGrp];
            } else if (typeof rawGrp === 'string' && rawGrp.indexOf('group_') === 0) {
              resolvedGrpId = cleanId(rawGrp, 'group_ungrouped');
            }
          }

          var idKeyUpper = idKey.toUpperCase();
          for (var i = 0; i < updatedOrders.length; i++) {
            var ord = updatedOrders[i];
            var ordTrack = String(ord.trackingCode || '').trim().toUpperCase();
            var ordId = String(ord.id || '').trim();

            if (ordTrack === idKeyUpper || ordId === idKey) {
              if (rawGrp !== undefined && rawGrp !== null) {
                ord.groupId = resolvedGrpId;
              }
              var patchLat = cleanCoordinate(lat, -90, 90);
              var patchLng = cleanCoordinate(lng, -180, 180);
              if (patchLat != null && patchLng != null) {
                ord.lat = patchLat;
                ord.lng = patchLng;
              }
              ord.updatedAt = new Date().toISOString();
              matchedCount++;
              break;
            }
          }
        });
      }

      return {
        valid: true,
        orders: updatedOrders,
        groups: updatedGroups,
        matchedCount: matchedCount
      };
    },

    /**
     * Áp dụng gói FULL (Toàn bộ đơn hàng) vào danh sách đơn
     */
    applyFull: function(fullPayload, currentOrders, currentGroups, isAppend) {
      if (!fullPayload || !Array.isArray(fullPayload.o) || fullPayload.o.length > 3000 || (fullPayload.g && (!Array.isArray(fullPayload.g) || fullPayload.g.length > 500))) {
        return { valid: false, orders: currentOrders || [], groups: currentGroups || [], groupRules: [], importedCount: 0 };
      }

      var groups = [].concat(currentGroups || []);
      var groupIndexMap = Object.create(null);

      var fullGroups = Array.isArray(fullPayload.g) ? fullPayload.g : [];
      if (fullGroups.length > 0) {
        fullGroups.forEach(function(item, idx) {
          var rawId = Array.isArray(item) ? item[0] : (item && item.id);
          var gId = cleanId(rawId, '');
          var gName = cleanText(Array.isArray(item) ? item[1] : (item && item.name), 100);
          if (gId) {
            groupIndexMap[idx] = gId;
            groupIndexMap[gId] = gId;
            if (!groups.some(function(g) { return g.id === gId; })) {
              groups.push({ id: gId, name: gName, isCollapsed: false });
            }
          }
        });
      }

      var unpackedOrders = [];
      fullPayload.o.forEach(function(item, index) {
        if (!item || (typeof item !== 'object')) return;
        var isCompactArray = Array.isArray(item);
        var extra = isCompactArray ? item[10] : item;
        if (!extra || typeof extra !== 'object' || Array.isArray(extra)) extra = {};
        var gVal = isCompactArray ? item[6] : item.g;
        var rawGroupId = (gVal !== '' && gVal != null && groupIndexMap[gVal]) ? groupIndexMap[gVal] : (typeof gVal === 'string' ? gVal : 'group_ungrouped');
        var groupId = cleanId(rawGroupId, 'group_ungrouped');
        var codAmount = cleanAmount(isCompactArray ? item[4] : item.m);
        var status = cleanText(isCompactArray ? item[5] : item.s, 20).toLowerCase();
        var subStatus = cleanText(extra.subStatus || extra.ss, 40).toLowerCase();
        if (['pending', 'gtc', 'gtb', 'cho_ck'].indexOf(status) === -1) status = 'pending';
        if (['cho_ck', 'hen_giao_lai', 'knm', 'tu_choi'].indexOf(subStatus) === -1) subStatus = '';

        var order = {
          id: cleanId(extra.id || item.id, generateLocalOrderId(index)),
          trackingCode: cleanText(isCompactArray ? item[0] : item.c, 100),
          customerName: cleanText(isCompactArray ? item[1] : item.n, 200),
          phone: cleanPhone(isCompactArray ? item[2] : item.p),
          address: cleanText(isCompactArray ? item[3] : item.a, 1000),
          codAmount: codAmount,
          phaiThu: cleanAmount(extra.phaiThu != null ? extra.phaiThu : extra.pay, codAmount),
          gtbThu: cleanAmount(extra.gtbThu != null ? extra.gtbThu : extra.gt),
          secondaryPhone: cleanPhone(extra.secondaryPhone || extra.sp),
          notes: cleanText(extra.notes, 1000),
          extraNotes: cleanText(extra.extraNotes, 1000),
          status: status,
          subStatus: subStatus,
          gtbReason: cleanText(extra.gtbReason || extra.reason, 300),
          groupId: groupId,
          lat: cleanCoordinate(isCompactArray ? item[7] : item.x, -90, 90),
          lng: cleanCoordinate(isCompactArray ? item[8] : item.y, -180, 180),
          tripCode: cleanText(isCompactArray ? item[9] : item.t, 100),
          createdAt: cleanText(extra.createdAt || extra.created, 40) || new Date().toISOString(),
          updatedAt: cleanText(extra.updatedAt || extra.updated, 40) || new Date().toISOString(),
          deliveredAt: cleanText(extra.deliveredAt || extra.delivered, 40),
          outlierReason: cleanText(extra.outlierReason, 300),
          gpsOutlierDist: cleanAmount(extra.gpsOutlierDist),
          healedSource: cleanText(extra.healedSource, 40),
          healedAlleyLevel: cleanText(extra.healedAlleyLevel, 100),
          isGpsOutlier: !!extra.isGpsOutlier,
          isFakeHubCoord: !!extra.isFakeHubCoord,
          isDistrictMismatch: !!extra.isDistrictMismatch,
          isGpsHealed: !!extra.isGpsHealed
        };
        unpackedOrders.push(order);
      });

      var existingOrders = [].concat(currentOrders || []);
      function mergeExisting(newOrder) {
        var existing = existingOrders.find(function(order) {
          return (newOrder.trackingCode && String(order.trackingCode || '').trim().toUpperCase() === newOrder.trackingCode.toUpperCase()) || order.id === newOrder.id;
        });
        if (!existing) return newOrder;
        var merged = Object.assign({}, existing, newOrder, {
          id: existing.id || newOrder.id,
          createdAt: existing.createdAt || newOrder.createdAt
        });
        if (Number(fullPayload.v) < 3) {
          ['phaiThu', 'gtbThu', 'secondaryPhone', 'notes', 'extraNotes', 'subStatus', 'gtbReason', 'deliveredAt'].forEach(function(key) {
            if (existing[key] !== undefined) merged[key] = existing[key];
          });
        }
        return merged;
      }

      var finalOrders;
      if (isAppend) {
        finalOrders = existingOrders;
        unpackedOrders.forEach(function(newOrd) {
          var existIdx = finalOrders.findIndex(function(o) {
            return (newOrd.trackingCode && String(o.trackingCode || '').trim().toUpperCase() === String(newOrd.trackingCode).trim().toUpperCase()) || o.id === newOrd.id;
          });
          if (existIdx !== -1) {
            finalOrders[existIdx] = mergeExisting(newOrd);
          } else {
            finalOrders.push(newOrd);
          }
        });
      } else {
        finalOrders = unpackedOrders.map(mergeExisting);
      }

      var extractedRules = (fullPayload && fullPayload.payload && fullPayload.payload.gr) || (fullPayload && fullPayload.groupRules) || [];

      return {
        valid: true,
        orders: finalOrders,
        groups: groups,
        groupRules: Array.isArray(extractedRules) ? extractedRules.slice(0, 1000) : [],
        importedCount: unpackedOrders.length,
        rejectedCount: fullPayload.o.length - unpackedOrders.length
      };
    },

    /**
     * Xuất dữ liệu ra JSON để tải về máy
     */
    exportToFileData: function(orders, groups, verifiedGeocache, groupRules) {
      return JSON.stringify({
        version: 1,
        source: 'GHN_LOGISTICS_SYNC',
        exportedAt: new Date().toISOString(),
        groups: groups || [],
        orders: orders || [],
        groupRules: groupRules || [],
        verifiedGeocache: verifiedGeocache || {}
      }, null, 2);
    }
  };

  P2PSync.sanitizeVerifiedGeocache = cleanVerifiedGeocache;
  P2PSync.sanitizeBackupData = sanitizeBackupData;

  if (typeof window !== 'undefined') {
    window.P2PSync = P2PSync;
    window.QRSync = P2PSync; // Tương thích ngược
  }

  return P2PSync;
});
