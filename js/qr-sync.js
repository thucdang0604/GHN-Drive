/**
 * js/qr-sync.js - Module Đồng Bộ Dữ Liệu GHN Qua Mã QR (100% Offline)
 * Hỗ trợ nén LZ-String siêu nhẹ, chia nhỏ phân đoạn thông minh, và giải mã tự động nạp dữ liệu.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QRSync = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var PREFIX_PATCH  = 'GHNPATCH:';
  var PREFIX_PATCHZ = 'GHNPATCHZ:';
  var PREFIX_FULL   = 'GHNFULL:';
  var PREFIX_FULLZ  = 'GHNFULLZ:';

  // Bộ giải nén/nén LZString nhúng trực tiếp làm phương án dự phòng 100% độc lập
  var _embeddedLZ = (function() {
    var r = String.fromCharCode,
        n = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",
        e = {};
    function t(r, o) {
      if (!e[r]) {
        e[r] = {};
        for (var n = 0; n < r.length; n++) e[r][r.charAt(n)] = n;
      }
      return e[r][o];
    }
    var i = {
      compressToEncodedURIComponent: function(r) {
        return null == r ? "" : i._compress(r, 6, function(r) { return n.charAt(r); });
      },
      decompressFromEncodedURIComponent: function(r) {
        if (null == r) return "";
        if ("" == r) return null;
        r = r.replace(/ /g, "+");
        return i._decompress(r.length, 32, function(o) { return t(n, r.charAt(o)); });
      },
      _compress: function(r, o, n) {
        if (null == r) return "";
        var e, t, i, s = {}, u = {}, a = "", p = "", c = "", l = 2, f = 3, h = 2, d = [], m = 0, v = 0;
        for (i = 0; i < r.length; i += 1) {
          a = r.charAt(i);
          if (!Object.prototype.hasOwnProperty.call(s, a)) { s[a] = f++; u[a] = true; }
          p = c + a;
          if (Object.prototype.hasOwnProperty.call(s, p)) { c = p; }
          else {
            if (Object.prototype.hasOwnProperty.call(u, c)) {
              if (c.charCodeAt(0) < 256) {
                for (e = 0; e < h; e++) { m <<= 1; if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } }
                for (t = c.charCodeAt(0), e = 0; e < 8; e++) { m = m << 1 | (1 & t); if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t >>= 1; }
              } else {
                for (t = 1, e = 0; e < h; e++) { m = m << 1 | t; if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t = 0; }
                for (t = c.charCodeAt(0), e = 0; e < 16; e++) { m = m << 1 | (1 & t); if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t >>= 1; }
              }
              if (0 == --l) { l = Math.pow(2, h); h++; }
              delete u[c];
            } else {
              for (t = s[c], e = 0; e < h; e++) { m = m << 1 | (1 & t); if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t >>= 1; }
            }
            if (0 == --l) { l = Math.pow(2, h); h++; }
            s[p] = f++;
            c = String(a);
          }
        }
        if ("" !== c) {
          if (Object.prototype.hasOwnProperty.call(u, c)) {
            if (c.charCodeAt(0) < 256) {
              for (e = 0; e < h; e++) { m <<= 1; if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } }
              for (t = c.charCodeAt(0), e = 0; e < 8; e++) { m = m << 1 | (1 & t); if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t >>= 1; }
            } else {
              for (t = 1, e = 0; e < h; e++) { m = m << 1 | t; if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t = 0; }
              for (t = c.charCodeAt(0), e = 0; e < 16; e++) { m = m << 1 | (1 & t); if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t >>= 1; }
            }
            if (0 == --l) { l = Math.pow(2, h); h++; }
            delete u[c];
          } else {
            for (t = s[c], e = 0; e < h; e++) { m = m << 1 | (1 & t); if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t >>= 1; }
          }
          if (0 == --l) { l = Math.pow(2, h); h++; }
        }
        for (t = 2, e = 0; e < h; e++) { m = m << 1 | (1 & t); if (v == o - 1) { v = 0; d.push(n(m)); m = 0; } else { v++; } t >>= 1; }
        for (;;) {
          m <<= 1;
          if (v == o - 1) { d.push(n(m)); break; }
          v++;
        }
        return d.join("");
      },
      _decompress: function(o, n, e) {
        var t, i, s, u, a, p, c, l = [], f = 4, h = 4, d = 3, m = "", v = [], g = { val: e(0), position: n, index: 1 };
        for (t = 0; t < 3; t += 1) l[t] = t;
        for (s = 0, a = Math.pow(2, 2), p = 1; p != a;) {
          u = g.val & g.position;
          g.position >>= 1;
          if (0 == g.position) { g.position = n; g.val = e(g.index++); }
          s |= (u > 0 ? 1 : 0) * p;
          p <<= 1;
        }
        switch (s) {
          case 0:
            for (s = 0, a = Math.pow(2, 8), p = 1; p != a;) {
              u = g.val & g.position;
              g.position >>= 1;
              if (0 == g.position) { g.position = n; g.val = e(g.index++); }
              s |= (u > 0 ? 1 : 0) * p;
              p <<= 1;
            }
            c = r(s);
            break;
          case 1:
            for (s = 0, a = Math.pow(2, 16), p = 1; p != a;) {
              u = g.val & g.position;
              g.position >>= 1;
              if (0 == g.position) { g.position = n; g.val = e(g.index++); }
              s |= (u > 0 ? 1 : 0) * p;
              p <<= 1;
            }
            c = r(s);
            break;
          case 2:
            return "";
        }
        for (l[3] = c, i = c, v.push(c);;) {
          if (g.index > o) return "";
          for (s = 0, a = Math.pow(2, d), p = 1; p != a;) {
            u = g.val & g.position;
            g.position >>= 1;
            if (0 == g.position) { g.position = n; g.val = e(g.index++); }
            s |= (u > 0 ? 1 : 0) * p;
            p <<= 1;
          }
          switch (c = s) {
            case 0:
              for (s = 0, a = Math.pow(2, 8), p = 1; p != a;) {
                u = g.val & g.position;
                g.position >>= 1;
                if (0 == g.position) { g.position = n; g.val = e(g.index++); }
                s |= (u > 0 ? 1 : 0) * p;
                p <<= 1;
              }
              l[h++] = r(s);
              c = h - 1;
              f--;
              break;
            case 1:
              for (s = 0, a = Math.pow(2, 16), p = 1; p != a;) {
                u = g.val & g.position;
                g.position >>= 1;
                if (0 == g.position) { g.position = n; g.val = e(g.index++); }
                s |= (u > 0 ? 1 : 0) * p;
                p <<= 1;
              }
              l[h++] = r(s);
              c = h - 1;
              f--;
              break;
            case 2:
              return v.join("");
          }
          if (0 == f) { f = Math.pow(2, d); d++; }
          if (l[c]) { m = l[c]; }
          else {
            if (c !== h) return null;
            m = i + i.charAt(0);
          }
          v.push(m);
          l[h++] = i + m.charAt(0);
          i = m;
          if (0 == --f) { f = Math.pow(2, d); d++; }
        }
      }
    };
    return i;
  })();

  function getLZ() {
    if (typeof LZString !== 'undefined' && LZString.decompressFromEncodedURIComponent) return LZString;
    if (typeof window !== 'undefined' && window.LZString && window.LZString.decompressFromEncodedURIComponent) return window.LZString;
    if (typeof global !== 'undefined' && global.LZString && global.LZString.decompressFromEncodedURIComponent) return global.LZString;
    try {
      if (typeof require === 'function') {
        var reqLZ = require('./lz-string.min.js');
        if (reqLZ && reqLZ.decompressFromEncodedURIComponent) return reqLZ;
      }
    } catch(e) {}
    return _embeddedLZ;
  }

  var QRSync = {
    PREFIX_PATCH: PREFIX_PATCH,
    PREFIX_PATCHZ: PREFIX_PATCHZ,
    PREFIX_FULL: PREFIX_FULL,
    PREFIX_FULLZ: PREFIX_FULLZ,

    /**
     * Hàm sinh và vẽ mã QR vào container bằng thẻ <img> chuẩn, module to rõ nét
     */
    renderQR: function(container, text, options) {
      if (!container) return false;
      options = options || {};
      container.innerHTML = '';

      var qrEngine = (typeof qrcode !== 'undefined') ? qrcode : (typeof window !== 'undefined' ? window.qrcode : null);
      if (!qrEngine) {
        container.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:15px; text-align:center;">⚠️ Chưa tải được thư viện tạo mã QR (js/qrcode.min.js)!</div>';
        return false;
      }

      try {
        var qr = qrEngine(0, 'L');
        qr.addData(text);
        qr.make();
        var cellSize = options.cellSize || 4;
        var margin = (options.margin !== undefined) ? options.margin : 3;
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
      } catch(err) {
        console.error('Lỗi tạo mã QR:', err);
        container.innerHTML = '<div style="color:#ef4444; font-size:12px; padding:15px; text-align:center;">⚠️ Không thể tạo mã: ' + (err.message || err) + '</div>';
        return false;
      }
    },

    /**
     * Tạo danh sách các chuỗi mã QR theo chế độ PATCH (chỉ nhóm & tọa độ kéo ghim)
     * Cân bằng thông minh: Tối đa 8 đơn và 2 nhóm mỗi phần để QR luôn thưa, to (65x65 modules), camera quét tức thì (<0.1s).
     * @param {Array} orders - Danh sách đơn hàng hiện tại
     * @param {Array} groups - Danh sách các nhóm địa chỉ
     * @param {Object} geocache - Cache tọa độ đã lưu (tùy chọn)
     * @param {number} maxItemsPerQR - Số lượng đơn mỗi mã QR (mặc định 8 đơn/mã)
     * @returns {Array<string>} - Mảng các chuỗi mã QR sẵn sàng render
     */
    generatePatchQRs: function(orders, groups, geocache, maxItemsPerQR) {
      var sid = Date.now().toString(36);
      var LZ = getLZ();

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
      for (var i = 0; i < (orders || []).length; i++) {
        var o = orders[i];
        var idKey = String(o.trackingCode || o.id || '').trim();
        if (!idKey) continue;
        var lat = (o.lat != null && !isNaN(o.lat)) ? Number(Number(o.lat).toFixed(5)) : null;
        var lng = (o.lng != null && !isNaN(o.lng)) ? Number(Number(o.lng).toFixed(5)) : null;
        var grpIdx = (o.groupId && grpMap[o.groupId] !== undefined) ? grpMap[o.groupId] : '';
        patches.push([idKey, grpIdx, lat, lng]);
      }

      // Cân bằng thông minh: Tối đa 12 đơn và 3 nhóm mỗi phần để vừa ít trang (chỉ 3-5 mã), vừa thưa to (69x69 modules), quét tức thì (<0.1s)
      var targetItems = (typeof maxItemsPerQR === 'number' && maxItemsPerQR > 0 && maxItemsPerQR <= 12) ? maxItemsPerQR : 12;
      var numParts = 1;
      if (patches.length > targetItems || cleanGroups.length > 3) {
        var partsByOrders = Math.ceil(patches.length / targetItems);
        var partsByGroups = Math.ceil(cleanGroups.length / 3);
        numParts = Math.max(partsByOrders, partsByGroups, 1);
      }

      var itemsPerPart = Math.ceil(patches.length / numParts);
      var groupsPerPart = Math.ceil(cleanGroups.length / numParts);
      var result = [];

      for (var p = 0; p < numParts; p++) {
        var pSlice = patches.slice(p * itemsPerPart, (p + 1) * itemsPerPart);
        var gSlice = cleanGroups.slice(p * groupsPerPart, (p + 1) * groupsPerPart);
        var partPayload = {
          v: 2,
          sid: sid,
          t: 'patch',
          pIndex: p + 1,
          pTotal: numParts,
          g: gSlice,
          p: pSlice
        };
        var jsonStr = JSON.stringify(partPayload);
        if (LZ && LZ.compressToEncodedURIComponent) {
          result.push(PREFIX_PATCHZ + LZ.compressToEncodedURIComponent(jsonStr));
        } else {
          result.push(PREFIX_PATCH + jsonStr);
        }
      }
      return result;
    },

    /**
     * Tạo danh sách các chuỗi mã QR theo chế độ FULL (toàn bộ đơn hàng)
     * Cân bằng thông minh 3 đơn/mã và tối đa 1 nhóm/mã để mã QR luôn thanh thoát, dễ quét.
     * @param {Array} orders - Danh sách đơn hàng
     * @param {Array} groups - Danh sách nhóm
     * @param {number} maxItemsPerQR - Số lượng đơn mỗi mã QR (mặc định 3 đơn/mã)
     * @returns {Array<string>} - Mảng chuỗi mã QR
     */
    generateFullQRs: function(orders, groups, maxItemsPerQR) {
      var sid = Date.now().toString(36);
      var LZ = getLZ();

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

      var targetItems = (typeof maxItemsPerQR === 'number' && maxItemsPerQR > 0 && maxItemsPerQR <= 3) ? maxItemsPerQR : 3;
      var numParts = 1;
      if (compactOrders.length > targetItems || cleanGroups.length > 1) {
        var partsByOrders = Math.ceil(compactOrders.length / targetItems);
        var partsByGroups = Math.ceil(cleanGroups.length / 1);
        numParts = Math.max(partsByOrders, partsByGroups, 1);
      }

      var itemsPerPart = Math.ceil(compactOrders.length / numParts);
      var groupsPerPart = Math.ceil(cleanGroups.length / numParts);
      var result = [];

      for (var p = 0; p < numParts; p++) {
        var oSlice = compactOrders.slice(p * itemsPerPart, (p + 1) * itemsPerPart);
        var gSlice = cleanGroups.slice(p * groupsPerPart, (p + 1) * groupsPerPart);
        var partPayload = {
          v: 2,
          sid: sid,
          t: 'full',
          pIndex: p + 1,
          pTotal: numParts,
          g: gSlice,
          o: oSlice
        };
        var jsonStr = JSON.stringify(partPayload);
        if (LZ && LZ.compressToEncodedURIComponent) {
          result.push(PREFIX_FULLZ + LZ.compressToEncodedURIComponent(jsonStr));
        } else {
          result.push(PREFIX_FULL + jsonStr);
        }
      }
      return result;
    },

    /**
     * Kiểm tra xem văn bản quét được có phải là mã đồng bộ không
     */
    isSyncQR: function(text) {
      if (!text || typeof text !== 'string') return false;
      var trimmed = text.trim();
      if (trimmed.indexOf(PREFIX_PATCHZ) === 0 || trimmed.indexOf(PREFIX_PATCH) === 0 ||
          trimmed.indexOf(PREFIX_FULLZ) === 0 || trimmed.indexOf(PREFIX_FULL) === 0) {
        return true;
      }
      if (trimmed.indexOf('{') === 0 && (
          trimmed.indexOf('"type":"patch"') !== -1 ||
          trimmed.indexOf('"t":"patch"') !== -1 ||
          trimmed.indexOf('"t":"p"') !== -1 ||
          trimmed.indexOf('"t":"full"') !== -1 ||
          trimmed.indexOf('"t":"f"') !== -1)) {
        return true;
      }
      return false;
    },

    /**
     * Giải mã chuỗi QR và trả về payload (hỗ trợ cả nén LZString v2 và uncompressed v1)
     */
    parseQR: function(text) {
      if (!this.isSyncQR(text)) return null;
      var trimmed = text.trim();
      var jsonStr = '';
      var LZ = getLZ();

      var rawCompressed = '';
      if (trimmed.indexOf(PREFIX_PATCHZ) === 0) {
        rawCompressed = trimmed.substring(PREFIX_PATCHZ.length);
      } else if (trimmed.indexOf(PREFIX_FULLZ) === 0) {
        rawCompressed = trimmed.substring(PREFIX_FULLZ.length);
      }

      if (rawCompressed) {
        if (rawCompressed.indexOf('%') !== -1) {
          try {
            rawCompressed = decodeURIComponent(rawCompressed);
          } catch(e) {}
        }
        rawCompressed = rawCompressed.replace(/ /g, '+');
        if (LZ && LZ.decompressFromEncodedURIComponent) {
          jsonStr = LZ.decompressFromEncodedURIComponent(rawCompressed);
        }
      } else if (trimmed.indexOf(PREFIX_PATCH) === 0) {
        jsonStr = trimmed.substring(PREFIX_PATCH.length);
      } else if (trimmed.indexOf(PREFIX_FULL) === 0) {
        jsonStr = trimmed.substring(PREFIX_FULL.length);
      } else {
        jsonStr = trimmed;
      }

      if (!jsonStr) return null;

      try {
        var data = JSON.parse(jsonStr);
        if (data) {
          if (data.i !== undefined && data.pIndex === undefined) data.pIndex = data.i;
          if (data.n !== undefined && data.pTotal === undefined) data.pTotal = data.n;
          if (data.s !== undefined && data.sid === undefined) data.sid = data.s;
          if (data.t === 'p') data.t = 'patch';
          if (data.t === 'f') data.t = 'full';
        }
        return data;
      } catch(e) {
        console.error('Lỗi phân tích mã QR đồng bộ:', e);
        return null;
      }
    },

    /**
     * Áp dụng gói PATCH vào dữ liệu hiện có trên máy nhận
     */
    applyPatch: function(patchPayload, currentOrders, currentGroups) {
      var updatedOrders = [].concat(currentOrders || []);
      var updatedGroups = [].concat(currentGroups || []);

      // 1. Cập nhật nhóm
      var groupIndexMap = {};
      if (Array.isArray(patchPayload.g) && patchPayload.g.length > 0) {
        patchPayload.g.forEach(function(item, idx) {
          var gId = Array.isArray(item) ? item[0] : (item && item.id);
          var gName = Array.isArray(item) ? item[1] : (item && item.name);
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

      // 2. Cập nhật tọa độ và groupId cho các đơn
      var matchedCount = 0;
      if (Array.isArray(patchPayload.p)) {
        patchPayload.p.forEach(function(item) {
          var idKey = String(item[0]).trim();
          var rawGrp = item[1];
          var lat = item[2];
          var lng = item[3];

          var resolvedGrpId = 'group_ungrouped';
          if (rawGrp !== '' && rawGrp != null) {
            if (groupIndexMap[rawGrp]) {
              resolvedGrpId = groupIndexMap[rawGrp];
            } else if (typeof rawGrp === 'string' && rawGrp.indexOf('group_') === 0) {
              resolvedGrpId = rawGrp;
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
              if (lat != null && lng != null) {
                ord.lat = Number(lat);
                ord.lng = Number(lng);
              }
              ord.updatedAt = new Date().toISOString();
              matchedCount++;
              break;
            }
          }
        });
      }

      return {
        orders: updatedOrders,
        groups: updatedGroups,
        matchedCount: matchedCount,
        pIndex: patchPayload.pIndex || 1,
        pTotal: patchPayload.pTotal || 1
      };
    },

    /**
     * Áp dụng gói FULL (toàn bộ đơn hàng)
     */
    applyFull: function(fullPayload, currentOrders, currentGroups, isAppend) {
      var groups = [].concat(currentGroups || []);
      var groupIndexMap = {};

      if (Array.isArray(fullPayload.g) && fullPayload.g.length > 0) {
        fullPayload.g.forEach(function(item, idx) {
          var gId = Array.isArray(item) ? item[0] : (item && item.id);
          var gName = Array.isArray(item) ? item[1] : (item && item.name);
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
      if (Array.isArray(fullPayload.o)) {
        unpackedOrders = fullPayload.o.map(function(item) {
          if (Array.isArray(item)) {
            var gVal = item[6];
            var gId = (gVal !== '' && gVal != null && groupIndexMap[gVal]) ? groupIndexMap[gVal] : (typeof gVal === 'string' && gVal.indexOf('group_') === 0 ? gVal : 'group_ungrouped');
            return {
              id: 'ghn_' + (item[0] || Date.now()) + '_' + Math.random().toString(36).substr(2, 4),
              trackingCode: item[0] || '',
              customerName: item[1] || '',
              phone: item[2] || '',
              address: item[3] || '',
              codAmount: Number(item[4]) || 0,
              phaiThu: Number(item[4]) || 0,
              gtbThu: 0,
              status: item[5] || 'pending',
              groupId: gId,
              lat: (item[7] != null && item[7] !== '' && !isNaN(item[7])) ? Number(item[7]) : null,
              lng: (item[8] != null && item[8] !== '' && !isNaN(item[8])) ? Number(item[8]) : null,
              tripCode: item[9] || '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          } else {
            return {
              id: item.id || ('ghn_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
              trackingCode: item.c || '',
              customerName: item.n || '',
              phone: item.p || '',
              address: item.a || '',
              codAmount: Number(item.m) || 0,
              phaiThu: Number(item.m) || 0,
              gtbThu: 0,
              status: item.s || 'pending',
              groupId: item.g || 'group_ungrouped',
              lat: (item.x != null && !isNaN(item.x)) ? Number(item.x) : null,
              lng: (item.y != null && !isNaN(item.y)) ? Number(item.y) : null,
              tripCode: item.t || '',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
          }
        });
      }

      var finalOrders;
      if (isAppend) {
        finalOrders = [].concat(currentOrders || []);
        unpackedOrders.forEach(function(newOrd) {
          var existIdx = finalOrders.findIndex(function(o) {
            return (newOrd.trackingCode && String(o.trackingCode || '').trim().toUpperCase() === String(newOrd.trackingCode).trim().toUpperCase()) || o.id === newOrd.id;
          });
          if (existIdx !== -1) {
            finalOrders[existIdx] = Object.assign({}, finalOrders[existIdx], newOrd);
          } else {
            finalOrders.push(newOrd);
          }
        });
      } else {
        finalOrders = unpackedOrders;
      }

      return {
        orders: finalOrders,
        groups: groups,
        importedCount: unpackedOrders.length,
        pIndex: fullPayload.pIndex || 1,
        pTotal: fullPayload.pTotal || 1
      };
    },

    /**
     * Xuất toàn bộ dữ liệu ra JSON để tải về file
     */
    exportToFileData: function(orders, groups, verifiedGeocache) {
      return JSON.stringify({
        version: 1,
        source: 'GHN_LOGISTICS_SYNC',
        exportedAt: new Date().toISOString(),
        groups: groups || [],
        orders: orders || [],
        verifiedGeocache: verifiedGeocache || {}
      }, null, 2);
    }
  };

  return QRSync;
});
