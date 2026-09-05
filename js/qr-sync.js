/**
 * js/qr-sync.js - Module Đồng Bộ Dữ Liệu GHN Qua Mã QR (100% Offline)
 * Hỗ trợ tạo mã QR nén, chia nhỏ phân đoạn (multi-part), và giải mã tự động nạp dữ liệu.
 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QRSync = factory();
  }
})(typeof self !== 'undefined' ? self : this, function() {
  'use strict';

  var PREFIX_PATCH = 'GHNPATCH:';
  var PREFIX_FULL  = 'GHNFULL:';

  var QRSync = {
    PREFIX_PATCH: PREFIX_PATCH,
    PREFIX_FULL: PREFIX_FULL,

    /**
     * Tạo danh sách các chuỗi mã QR theo chế độ PATCH (chỉ nhóm & tọa độ kéo ghim)
     * Thích hợp cho Thiết bị B đã có sẵn danh sách đơn.
     * @param {Array} orders - Danh sách đơn hàng hiện tại
     * @param {Array} groups - Danh sách các nhóm địa chỉ
     * @param {Object} geocache - Cache tọa độ đã lưu (tùy chọn)
     * @param {number} maxItemsPerQR - Số lượng đơn mỗi mã QR (mặc định 40 đơn/mã để quét cực nhạy)
     * @returns {Array<string>} - Mảng các chuỗi mã QR sẵn sàng render
     */
    generatePatchQRs: function(orders, groups, geocache, maxItemsPerQR) {
      maxItemsPerQR = maxItemsPerQR || 40;
      var patches = [];
      for (var i = 0; i < (orders || []).length; i++) {
        var o = orders[i];
        var idKey = o.trackingCode || o.id;
        var lat = (o.lat != null && !isNaN(o.lat)) ? Number(Number(o.lat).toFixed(6)) : null;
        var lng = (o.lng != null && !isNaN(o.lng)) ? Number(Number(o.lng).toFixed(6)) : null;
        patches.push([idKey, o.groupId || 'group_ungrouped', lat, lng]);
      }

      var cleanGroups = (groups || []).map(function(g) {
        return { id: g.id, name: g.name };
      });

      if (patches.length <= maxItemsPerQR) {
        var payload = {
          v: 1,
          t: 'patch',
          pIndex: 1,
          pTotal: 1,
          g: cleanGroups,
          p: patches
        };
        return [PREFIX_PATCH + JSON.stringify(payload)];
      }

      var totalParts = Math.ceil(patches.length / maxItemsPerQR);
      var result = [];
      for (var p = 0; p < totalParts; p++) {
        var slice = patches.slice(p * maxItemsPerQR, (p + 1) * maxItemsPerQR);
        var partPayload = {
          v: 1,
          t: 'patch',
          pIndex: p + 1,
          pTotal: totalParts,
          g: p === 0 ? cleanGroups : [],
          p: slice
        };
        result.push(PREFIX_PATCH + JSON.stringify(partPayload));
      }
      return result;
    },

    /**
     * Tạo danh sách các chuỗi mã QR theo chế độ FULL (toàn bộ đơn hàng)
     * @param {Array} orders - Danh sách đơn hàng
     * @param {Array} groups - Danh sách nhóm
     * @param {number} maxItemsPerQR - Số lượng đơn mỗi mã QR (mặc định 18 đơn/mã để mã không bị dày)
     * @returns {Array<string>} - Mảng chuỗi mã QR
     */
    generateFullQRs: function(orders, groups, maxItemsPerQR) {
      maxItemsPerQR = maxItemsPerQR || 8;
      var cleanGroups = (groups || []).map(function(g) {
        return { id: g.id, name: g.name };
      });

      var compactOrders = (orders || []).map(function(o) {
        return {
          id: o.id,
          c: o.trackingCode || '',
          n: o.customerName || '',
          p: o.phone || '',
          a: o.address || '',
          m: Number(o.codAmount) || 0,
          s: o.status || 'pending',
          g: o.groupId || 'group_ungrouped',
          x: (o.lat != null && !isNaN(o.lat)) ? Number(Number(o.lat).toFixed(6)) : null,
          y: (o.lng != null && !isNaN(o.lng)) ? Number(Number(o.lng).toFixed(6)) : null,
          t: o.tripCode || ''
        };
      });

      if (compactOrders.length <= maxItemsPerQR) {
        var payload = {
          v: 1,
          t: 'full',
          pIndex: 1,
          pTotal: 1,
          g: cleanGroups,
          o: compactOrders
        };
        return [PREFIX_FULL + JSON.stringify(payload)];
      }

      var totalParts = Math.ceil(compactOrders.length / maxItemsPerQR);
      var result = [];
      for (var p = 0; p < totalParts; p++) {
        var slice = compactOrders.slice(p * maxItemsPerQR, (p + 1) * maxItemsPerQR);
        var partPayload = {
          v: 1,
          t: 'full',
          pIndex: p + 1,
          pTotal: totalParts,
          g: p === 0 ? cleanGroups : [],
          o: slice
        };
        result.push(PREFIX_FULL + JSON.stringify(partPayload));
      }
      return result;
    },

    /**
     * Kiểm tra xem văn bản quét được có phải là mã đồng bộ không
     */
    isSyncQR: function(text) {
      if (!text || typeof text !== 'string') return false;
      var trimmed = text.trim();
      if (trimmed.indexOf(PREFIX_PATCH) === 0 || trimmed.indexOf(PREFIX_FULL) === 0) {
        return true;
      }
      if (trimmed.indexOf('{') === 0 && (trimmed.indexOf('"type":"patch"') !== -1 || trimmed.indexOf('"t":"patch"') !== -1 || trimmed.indexOf('"t":"full"') !== -1)) {
        return true;
      }
      return false;
    },

    /**
     * Giải mã chuỗi QR và trả về payload
     */
    parseQR: function(text) {
      if (!this.isSyncQR(text)) return null;
      var trimmed = text.trim();
      var jsonStr = '';
      if (trimmed.indexOf(PREFIX_PATCH) === 0) {
        jsonStr = trimmed.substring(PREFIX_PATCH.length);
      } else if (trimmed.indexOf(PREFIX_FULL) === 0) {
        jsonStr = trimmed.substring(PREFIX_FULL.length);
      } else {
        jsonStr = trimmed;
      }

      try {
        var data = JSON.parse(jsonStr);
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

      // 1. Cập nhật nhóm mới nếu có
      if (Array.isArray(patchPayload.g) && patchPayload.g.length > 0) {
        patchPayload.g.forEach(function(newGrp) {
          if (!newGrp || !newGrp.id) return;
          var found = updatedGroups.find(function(g) { return g.id === newGrp.id; });
          if (found) {
            found.name = newGrp.name || found.name;
          } else {
            updatedGroups.push({
              id: newGrp.id,
              name: newGrp.name || 'Nhóm mới',
              isCollapsed: false
            });
          }
        });
      }

      // 2. Cập nhật tọa độ và groupId cho các đơn
      var matchedCount = 0;
      if (Array.isArray(patchPayload.p)) {
        patchPayload.p.forEach(function(item) {
          var idKey = String(item[0]).trim();
          var grpId = item[1];
          var lat = item[2];
          var lng = item[3];

          for (var i = 0; i < updatedOrders.length; i++) {
            var ord = updatedOrders[i];
            var ordTrack = String(ord.trackingCode || '').trim();
            var ordId = String(ord.id || '').trim();

            if (ordTrack === idKey || ordId === idKey) {
              if (grpId) ord.groupId = grpId;
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
      if (Array.isArray(fullPayload.g) && fullPayload.g.length > 0) {
        if (!isAppend) {
          groups = fullPayload.g.map(function(g) {
            return { id: g.id, name: g.name, isCollapsed: false };
          });
        } else {
          fullPayload.g.forEach(function(newG) {
            if (!groups.some(function(g) { return g.id === newG.id; })) {
              groups.push({ id: newG.id, name: newG.name, isCollapsed: false });
            }
          });
        }
      }

      var unpackedOrders = [];
      if (Array.isArray(fullPayload.o)) {
        unpackedOrders = fullPayload.o.map(function(item) {
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
        });
      }

      var finalOrders;
      if (isAppend) {
        finalOrders = [].concat(currentOrders || []);
        unpackedOrders.forEach(function(newOrd) {
          var existIdx = finalOrders.findIndex(function(o) {
            return (newOrd.trackingCode && o.trackingCode === newOrd.trackingCode) || o.id === newOrd.id;
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
