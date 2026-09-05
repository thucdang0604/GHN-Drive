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

  function getLZ() {
    if (typeof LZString !== 'undefined') return LZString;
    if (typeof window !== 'undefined' && window.LZString) return window.LZString;
    if (typeof global !== 'undefined' && global.LZString) return global.LZString;
    try {
      if (typeof require === 'function') return require('./lz-string.min.js');
    } catch(e) {}
    return null;
  }

  var QRSync = {
    PREFIX_PATCH: PREFIX_PATCH,
    PREFIX_PATCHZ: PREFIX_PATCHZ,
    PREFIX_FULL: PREFIX_FULL,
    PREFIX_FULLZ: PREFIX_FULLZ,

    /**
     * Hàm sinh và vẽ mã QR vào container bằng thẻ <img> chuẩn, không lỗi hiển thị
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
        container.innerHTML = qr.createImgTag(options.cellSize || 3, options.margin || 4);
        var img = container.querySelector('img');
        if (img) {
          img.style.maxWidth = '100%';
          img.style.maxHeight = '100%';
          img.style.height = 'auto';
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
     * Nhờ nén LZString & mã hóa nhóm theo chỉ mục, có thể chứa tới 75-80 đơn hàng trong 1 MÃ DUY NHẤT!
     * @param {Array} orders - Danh sách đơn hàng hiện tại
     * @param {Array} groups - Danh sách các nhóm địa chỉ
     * @param {Object} geocache - Cache tọa độ đã lưu (tùy chọn)
     * @param {number} maxItemsPerQR - Số lượng đơn mỗi mã QR (mặc định 75 đơn/mã)
     * @returns {Array<string>} - Mảng các chuỗi mã QR sẵn sàng render
     */
    generatePatchQRs: function(orders, groups, geocache, maxItemsPerQR) {
      maxItemsPerQR = maxItemsPerQR || 75;
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

      var totalParts = Math.max(1, Math.ceil(patches.length / maxItemsPerQR));
      var result = [];

      for (var p = 0; p < totalParts; p++) {
        var slice = patches.slice(p * maxItemsPerQR, (p + 1) * maxItemsPerQR);
        var partPayload = {
          v: 2,
          sid: sid,
          t: 'patch',
          pIndex: p + 1,
          pTotal: totalParts,
          g: p === 0 ? cleanGroups : [],
          p: slice
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
     * Nhờ nén LZString và định dạng mảng gọn, tăng từ 4 đơn/mã lên 22 đơn/mã (giảm từ 13 trang xuống 2-3 trang!)
     * @param {Array} orders - Danh sách đơn hàng
     * @param {Array} groups - Danh sách nhóm
     * @param {number} maxItemsPerQR - Số lượng đơn mỗi mã QR (mặc định 22 đơn/mã)
     * @returns {Array<string>} - Mảng chuỗi mã QR
     */
    generateFullQRs: function(orders, groups, maxItemsPerQR) {
      maxItemsPerQR = maxItemsPerQR || 22;
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

      var totalParts = Math.max(1, Math.ceil(compactOrders.length / maxItemsPerQR));
      var result = [];

      for (var p = 0; p < totalParts; p++) {
        var slice = compactOrders.slice(p * maxItemsPerQR, (p + 1) * maxItemsPerQR);
        var partPayload = {
          v: 2,
          sid: sid,
          t: 'full',
          pIndex: p + 1,
          pTotal: totalParts,
          g: p === 0 ? cleanGroups : [],
          o: slice
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
      if (trimmed.indexOf('{') === 0 && (trimmed.indexOf('"type":"patch"') !== -1 || trimmed.indexOf('"t":"patch"') !== -1 || trimmed.indexOf('"t":"full"') !== -1)) {
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

      if (trimmed.indexOf(PREFIX_PATCHZ) === 0) {
        var rawCompressed = trimmed.substring(PREFIX_PATCHZ.length);
        if (LZ && LZ.decompressFromEncodedURIComponent) {
          jsonStr = LZ.decompressFromEncodedURIComponent(rawCompressed);
        }
      } else if (trimmed.indexOf(PREFIX_FULLZ) === 0) {
        var rawCompressed = trimmed.substring(PREFIX_FULLZ.length);
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
            // Compact format v2: [c, n, p, a, m, s, gIdx, lat, lng, t]
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
            // Legacy format v1
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
