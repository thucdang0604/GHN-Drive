(() => {
  // js/storage.js
  var STORAGE_KEY = "ghn_orders_data_v1";
  var GROUPS_STORAGE_KEY = "ghn_order_groups_v1";
  var GROUP_RULES_STORAGE_KEY = "ghn_group_rules_v1";
  var StorageService = {
    /**
     * Lấy toàn bộ danh sách đơn hàng đã lưu
     */
    getOrders() {
      try {
        const data = localStorage.getItem(STORAGE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("L\u1ED7i khi \u0111\u1ECDc LocalStorage:", e);
        return [];
      }
    },
    /**
     * Lưu toàn bộ danh sách đơn hàng (bao gồm thứ tự đã sắp xếp)
     */
    saveOrders(orders) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
        return true;
      } catch (e) {
        console.error("L\u1ED7i khi ghi v\xE0o LocalStorage:", e);
        return false;
      }
    },
    /**
     * Thêm một hoặc nhiều đơn hàng vào danh sách
     */
    addOrders(newOrders) {
      const current = this.getOrders();
      const formattedNew = newOrders.map((item) => ({
        id: item.id || "ghn_" + Date.now() + "_" + Math.random().toString(36).substr(2, 6),
        trackingCode: item.trackingCode || "",
        tripCode: item.tripCode || "",
        customerName: item.customerName || "",
        phone: item.phone || "",
        address: item.address || "",
        codAmount: Number(item.codAmount) || 0,
        phaiThu: Number(item.phaiThu != null ? item.phaiThu : item.codAmount) || 0,
        gtbThu: Number(item.gtbThu) || 0,
        status: item.status || "pending",
        // 'pending' | 'gtc' | 'gtb'
        notes: item.notes || "",
        groupId: item.groupId || "group_ungrouped",
        lat: item.lat != null ? Number(item.lat) : null,
        lng: item.lng != null ? Number(item.lng) : null,
        createdAt: item.createdAt || (/* @__PURE__ */ new Date()).toISOString(),
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      }));
      const updated = [...current, ...formattedNew];
      this.saveOrders(updated);
      return updated;
    },
    /**
     * Cập nhật trạng thái đơn hàng (GTB / GTC / Pending)
     */
    updateOrderStatus(orderId, status) {
      const current = this.getOrders();
      const updated = current.map((item) => {
        if (item.id === orderId) {
          return {
            ...item,
            status,
            updatedAt: (/* @__PURE__ */ new Date()).toISOString()
          };
        }
        return item;
      });
      this.saveOrders(updated);
      return updated;
    },
    /**
     * Cập nhật toàn bộ thứ tự mảng đơn hàng sau khi kéo thả / dịch chuyển
     */
    reorderOrders(newOrderedList) {
      this.saveOrders(newOrderedList);
      return newOrderedList;
    },
    /**
     * Dịch chuyển 1 đơn hàng lên hoặc xuống 1 bậc
     */
    moveOrder(orderId, direction) {
      const orders = this.getOrders();
      const index = orders.findIndex((o) => o.id === orderId);
      if (index === -1) return orders;
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= orders.length) return orders;
      const temp = orders[index];
      orders[index] = orders[targetIndex];
      orders[targetIndex] = temp;
      this.saveOrders(orders);
      return orders;
    },
    /**
     * Xóa 1 đơn hàng cụ thể
     */
    deleteOrder(orderId) {
      const orders = this.getOrders().filter((o) => o.id !== orderId);
      this.saveOrders(orders);
      return orders;
    },
    /**
     * Dọn dẹp các đơn hàng cũ đã xử lý xong (Trạng thái là GTC hoặc GTB)
     * Trả về danh sách đơn còn lại (chỉ giữ lại đơn đang 'pending' hoặc chưa xong)
     */
    cleanProcessedOrders(onlyStatus = null) {
      const current = this.getOrders();
      let remaining;
      if (onlyStatus) {
        remaining = current.filter((o) => o.status !== onlyStatus);
      } else {
        remaining = current.filter((o) => o.status === "pending");
      }
      this.saveOrders(remaining);
      return remaining;
    },
    /**
     * Xóa toàn bộ dữ liệu (Reset hoàn toàn)
     */
    clearAll() {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(GROUPS_STORAGE_KEY);
      return [];
    },
    /**
     * Lấy danh sách các nhóm địa chỉ
     */
    getGroups() {
      try {
        const data = localStorage.getItem(GROUPS_STORAGE_KEY);
        if (!data) return [{ id: "group_ungrouped", name: "Ch\u01B0a ph\xE2n nh\xF3m", isCollapsed: false }];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : [{ id: "group_ungrouped", name: "Ch\u01B0a ph\xE2n nh\xF3m", isCollapsed: false }];
      } catch (e) {
        return [{ id: "group_ungrouped", name: "Ch\u01B0a ph\xE2n nh\xF3m", isCollapsed: false }];
      }
    },
    /**
     * Lưu danh sách các nhóm địa chỉ
     */
    saveGroups(groups) {
      try {
        localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(groups));
        return true;
      } catch (e) {
        console.error("L\u1ED7i khi l\u01B0u groups:", e);
        return false;
      }
    },
    /**
     * Thêm dữ liệu mẫu ban đầu nếu người dùng chưa có đơn nào
     */
    loadSampleIfEmpty() {
      const current = this.getOrders();
      if (current.length === 0) {
        const sample = [
          {
            id: "ghn_sample_1",
            trackingCode: "VNGH80617648808",
            customerName: "Ngo\u0323c A\u0301nh",
            phone: "0969199184",
            address: "Centec Tower, 72 74 \u0110\u01B0\u1EDDng Nguy\u1EC5n Th\u1ECB Minh Khai, P. V\xF5 Th\u1ECB S\xE1u, Q. 3, TP.HCM",
            codAmount: 0,
            status: "pending",
            groupId: "group_ungrouped",
            lat: 10.779774,
            lng: 106.693156,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: "ghn_sample_2",
            trackingCode: "VNGH80617649912",
            customerName: "Tr\u1EA7n Minh",
            phone: "0908123456",
            address: "T\u1EA7ng 12, Centec Tower, 72 Nguy\u1EC5n Th\u1ECB Minh Khai, Q. 3",
            codAmount: 185e3,
            status: "pending",
            groupId: "group_ungrouped",
            lat: 10.779774,
            lng: 106.693156,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: "ghn_sample_3",
            trackingCode: "VNGH80617651034",
            customerName: "Ph\u1EA1m Thu H\u01B0\u01A1ng",
            phone: "0912345678",
            address: "T\xF2a nh\xE0 Centec 72-74 Nguy\u1EC5n Th\u1ECB Minh Khai, Ph\u01B0\u1EDDng V\xF5 Th\u1ECB S\xE1u, Qu\u1EADn 3",
            codAmount: 32e4,
            status: "pending",
            groupId: "group_ungrouped",
            lat: null,
            lng: null,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: "ghn_sample_4",
            trackingCode: "VNGH80617652156",
            customerName: "L\xEA V\u0103n H\xF9ng",
            phone: "0987654321",
            address: "Vincom Center \u0110\u1ED3ng Kh\u1EDFi, 72 L\xEA Th\xE1nh T\xF4n, B\u1EBFn Ngh\xE9, Qu\u1EADn 1",
            codAmount: 25e4,
            status: "pending",
            groupId: "group_ungrouped",
            lat: 10.778,
            lng: 106.7018,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: "ghn_sample_5",
            trackingCode: "VNGH80617653278",
            customerName: "Ho\xE0ng Lan",
            phone: "0933557799",
            address: "18 Nguy\u1EC5n Th\u1ECB Minh Khai, P. \u0110a Kao, Qu\u1EADn 1",
            codAmount: 95e3,
            status: "pending",
            groupId: "group_ungrouped",
            lat: 10.7876,
            lng: 106.6998,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          },
          {
            id: "ghn_sample_6",
            trackingCode: "VNGH80617654390",
            customerName: "\u0110\u1EB7ng Qu\u1ED1c B\u1EA3o",
            phone: "0977889900",
            address: "154/8 Pasteur, P. B\u1EBFn Ngh\xE9, Qu\u1EADn 1",
            codAmount: 14e4,
            status: "pending",
            groupId: "group_ungrouped",
            lat: 10.7812,
            lng: 106.6985,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          }
        ];
        this.saveOrders(sample);
        return sample;
      }
      return current;
    },
    /**
     * Lấy cấu hình phân nhóm tự động theo tên đường & số nhà (Group Rules)
     */
    getGroupRules() {
      try {
        const data = localStorage.getItem(GROUP_RULES_STORAGE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) {
        console.error("L\u1ED7i khi \u0111\u1ECDc Group Rules:", e);
        return [];
      }
    },
    /**
     * Lưu cấu hình phân nhóm tự động theo tên đường & số nhà (Group Rules)
     */
    saveGroupRules(rules) {
      try {
        localStorage.setItem(GROUP_RULES_STORAGE_KEY, JSON.stringify(rules || []));
        return true;
      } catch (e) {
        console.error("L\u1ED7i khi ghi Group Rules:", e);
        return false;
      }
    },
    /**
     * Lấy cấu hình phân tuyến đội ngũ nhân viên (Fleet Dispatch)
     */
    getFleetDispatch() {
      try {
        const data = localStorage.getItem("ghn_fleet_dispatch_v1");
        if (!data) return null;
        return JSON.parse(data);
      } catch (e) {
        console.error("L\u1ED7i khi \u0111\u1ECDc Fleet Dispatch:", e);
        return null;
      }
    },
    /**
     * Lưu cấu hình phân tuyến đội ngũ nhân viên (Fleet Dispatch)
     */
    saveFleetDispatch(dispatchData) {
      try {
        localStorage.setItem("ghn_fleet_dispatch_v1", JSON.stringify(dispatchData));
        return true;
      } catch (e) {
        console.error("L\u1ED7i khi ghi Fleet Dispatch:", e);
        return false;
      }
    },
    /**
     * Xóa cấu hình phân tuyến đội ngũ nhân viên
     */
    clearFleetDispatch() {
      try {
        localStorage.removeItem("ghn_fleet_dispatch_v1");
        return true;
      } catch (e) {
        return false;
      }
    }
  };

  // js/geo-healer.js
  var VERIFIED_LANDMARKS = [
    {
      key: "centec_tower",
      names: ["centec tower", "centec", "t\xF2a nh\xE0 centec", "to\xE0 centec", "72 74 nguyen thi minh khai"],
      street: "Nguy\u1EC5n Th\u1ECB Minh Khai",
      houseNumber: "72-74",
      ward: "Ph\u01B0\u1EDDng V\xF5 Th\u1ECB S\xE1u",
      district: "Qu\u1EADn 3",
      lat: 10.781827,
      lng: 106.694695
    },
    {
      key: "diamond_plaza",
      names: ["diamond plaza", "diamond", "t\xF2a nh\xE0 diamond"],
      street: "L\xEA Du\u1EA9n",
      houseNumber: "34",
      ward: "Ph\u01B0\u1EDDng B\u1EBFn Ngh\xE9",
      district: "Qu\u1EADn 1",
      lat: 10.780721,
      lng: 106.698755
    },
    {
      key: "vincom_dong_khoi",
      names: ["vincom \u0111\u1ED3ng kh\u1EDFi", "vincom center \u0111\u1ED3ng kh\u1EDFi", "vincom center", "vincom dong khoi"],
      street: "\u0110\u1ED3ng Kh\u1EDFi",
      houseNumber: "72",
      ward: "Ph\u01B0\u1EDDng B\u1EBFn Ngh\xE9",
      district: "Qu\u1EADn 1",
      lat: 10.778002,
      lng: 106.702008
    },
    {
      key: "bitexco",
      names: ["bitexco", "bitexco financial tower", "th\xE1p t\xE0i ch\xEDnh bitexco"],
      street: "H\u1EA3i Tri\u1EC1u",
      houseNumber: "2",
      ward: "Ph\u01B0\u1EDDng B\u1EBFn Ngh\xE9",
      district: "Qu\u1EADn 1",
      lat: 10.771661,
      lng: 106.704439
    },
    {
      key: "saigon_centre",
      names: ["saigon centre", "takashimaya", "saigon center"],
      street: "L\xEA L\u1EE3i",
      houseNumber: "65",
      ward: "Ph\u01B0\u1EDDng B\u1EBFn Ngh\xE9",
      district: "Qu\u1EADn 1",
      lat: 10.773356,
      lng: 106.701026
    },
    {
      key: "hado_centrosa",
      names: ["h\xE0 \u0111\xF4 centrosa", "hado centrosa", "chung c\u01B0 h\xE0 \u0111\xF4", "h\xE0 \u0111\xF4 3/2", "hado centrosa garden"],
      street: "3 Th\xE1ng 2",
      houseNumber: "200",
      ward: "Ph\u01B0\u1EDDng 12",
      district: "Qu\u1EADn 10",
      lat: 10.774902,
      lng: 106.674932
    },
    {
      key: "viettel_complex",
      names: ["viettel complex", "t\xF2a nh\xE0 viettel", "viettel 285 c\xE1ch m\u1EA1ng th\xE1ng 8", "viettel cmt8"],
      street: "C\xE1ch M\u1EA1ng Th\xE1ng 8",
      houseNumber: "285",
      ward: "Ph\u01B0\u1EDDng 12",
      district: "Qu\u1EADn 10",
      lat: 10.778644,
      lng: 106.678036
    },
    {
      key: "landmark_81",
      names: ["landmark 81", "vinhome central park landmark 81", "l81"],
      street: "Nguy\u1EC5n H\u1EEFu C\u1EA3nh",
      houseNumber: "720A",
      ward: "Ph\u01B0\u1EDDng 22",
      district: "B\xECnh Th\u1EA1nh",
      lat: 10.795116,
      lng: 106.721832
    },
    {
      key: "m_plaza",
      names: ["mplaza", "m plaza", "kumho asiana", "kumho"],
      street: "L\xEA Du\u1EA9n",
      houseNumber: "39",
      ward: "Ph\u01B0\u1EDDng B\u1EBFn Ngh\xE9",
      district: "Qu\u1EADn 1",
      lat: 10.783103,
      lng: 106.700142
    },
    {
      key: "lim_tower_1",
      names: ["lim tower", "lim tower 1", "t\xF2a nh\xE0 lim"],
      street: "L\xEA Th\xE1nh T\xF4n",
      houseNumber: "9-11",
      ward: "Ph\u01B0\u1EDDng B\u1EBFn Ngh\xE9",
      district: "Qu\u1EADn 1",
      lat: 10.780132,
      lng: 106.705191
    },
    {
      key: "lim_tower_2",
      names: ["lim tower 2", "lim 2"],
      street: "C\xE1ch M\u1EA1ng Th\xE1ng 8",
      houseNumber: "158",
      ward: "Ph\u01B0\u1EDDng V\xF5 Th\u1ECB S\xE1u",
      district: "Qu\u1EADn 3",
      lat: 10.774351,
      lng: 106.687612
    },
    {
      key: "times_square",
      names: ["times square", "reverie saigon"],
      street: "Nguy\u1EC5n Hu\u1EC7",
      houseNumber: "22-36",
      ward: "Ph\u01B0\u1EDDng B\u1EBFn Ngh\xE9",
      district: "Qu\u1EADn 1",
      lat: 10.773822,
      lng: 106.704289
    },
    {
      key: "sunwah_tower",
      names: ["sunwah tower", "sunwah"],
      street: "Nguy\u1EC5n Hu\u1EC7",
      houseNumber: "115",
      ward: "Ph\u01B0\u1EDDng B\u1EBFn Ngh\xE9",
      district: "Qu\u1EADn 1",
      lat: 10.773121,
      lng: 106.703212
    }
  ];
  function getCoordDistanceMeters(lat1, lng1, lat2, lng2) {
    if (!isValidCoord(lat1, lng1) || !isValidCoord(lat2, lng2)) return 999999;
    const R = 6371e3;
    const dLat = (Number(lat2) - Number(lat1)) * Math.PI / 180;
    const dLng = (Number(lng2) - Number(lng1)) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(Number(lat1) * Math.PI / 180) * Math.cos(Number(lat2) * Math.PI / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
  function isValidCoord(lat, lng) {
    if (lat == null || lng == null) return false;
    const nLat = Number(lat);
    const nLng = Number(lng);
    return !isNaN(nLat) && !isNaN(nLng) && nLat > 8 && nLat < 24 && nLng > 102 && nLng < 110;
  }
  function parseAndNormalizeAddress(rawAddress) {
    if (!rawAddress) {
      return {
        cleanAddress: "",
        street: "Ch\u01B0a r\xF5 \u0111\u01B0\u1EDDng",
        houseNumber: "",
        houseNumVal: 999999,
        hasHouseNumber: false,
        buildingName: "",
        landmarkKey: null,
        landmarkCoords: null,
        locationFingerprint: "",
        secondaryPhone: null,
        extraNotes: "",
        warningFlags: []
      };
    }
    let addr = String(rawAddress).trim();
    let secondaryPhone = null;
    let extraNotes = "";
    const warningFlags = [];
    const phoneObj = extractPhone(addr);
    if (phoneObj) {
      secondaryPhone = phoneObj.phone;
      addr = addr.replace(phoneObj.raw, " ").trim();
    }
    const noteRegexes = [
      /\(([^)]*(?:gọi\s*trước|sau\s*5h|giờ\s*hành\s*chính|thu\s*khách|xem\s*hàng|kiểm\s*hàng|thất\s*bại|lưu\s*ý|giao\s*lại)[^)]*)\)/gi,
      /(?:ghi\s*chú|lưu\s*ý|note|gọi\s*trước\s*khi\s*(?:giao|tới)|gọi\s*trước|giao\s*giờ\s*hành\s*chính|sau\s*(?:17h|5h)|cho\s*khách\s*kiểm|thu\s*người\s*nhận|giao\s*thất\s*bại\s*thu)\s*[:\s]*([^,;.]+)/gi
    ];
    for (const reg of noteRegexes) {
      const match = addr.match(reg);
      if (match) {
        extraNotes += (extraNotes ? " | " : "") + match.join("; ").replace(/[()]/g, "").trim();
        addr = addr.replace(reg, " ").trim();
      }
    }
    addr = normalizeAddress(addr);
    let matchedLandmark = null;
    const addrNoTone = removeDiacritics(addr).toLowerCase();
    for (const lm of VERIFIED_LANDMARKS) {
      let isMatched = false;
      for (const name of lm.names) {
        const nameNoTone = removeDiacritics(name).toLowerCase();
        const escaped = nameNoTone.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const reg = new RegExp("\\b" + escaped + "\\b", "i");
        if (reg.test(addrNoTone)) {
          isMatched = true;
          break;
        }
      }
      if (!isMatched && lm.street && lm.houseNumber) {
        const stNoTone = removeDiacritics(lm.street).toLowerCase();
        if (addrNoTone.includes(stNoTone)) {
          const parts = lm.houseNumber.split(/[-–/]/).map((p) => p.trim());
          if (parts.some((p) => new RegExp(`(?:^|\\D)${p}(?:\\D|$)`).test(addrNoTone))) {
            isMatched = true;
          }
        }
      }
      if (isMatched) {
        matchedLandmark = lm;
        break;
      }
    }
    const mNumberedStreet = addr.match(/^(?:đường|phố|đ\.|đg\.)\s*(số\s*\d+[a-zA-Z]?)\s*[,.\s]+(?:nhà\s*số|số\s*nhà|nhà|số)?\s*[:\s]*([\d/]+[a-zA-Z-]*)(.*)$/i);
    if (mNumberedStreet) {
      const streetPart = "\u0110\u01B0\u1EDDng " + mNumberedStreet[1].trim();
      const housePart = mNumberedStreet[2].trim();
      const restPart = mNumberedStreet[3].trim();
      addr = `${housePart} ${streetPart}${restPart ? ", " + restPart.replace(/^[,.\s]+/, "") : ""}`;
    } else {
      const mInverted = addr.match(/^(?:đường|phố|đ\.|đg\.)\s*([a-zA-ZÀ-Ỹà-ỹ0-9\s/]+?)\s+(?:nhà\s*số|số\s*nhà|nhà)\s*[:\s]*([\d/]+[a-zA-Z-]*)(.*)$/i);
      if (mInverted && !/^\s*số\s*\d+/i.test(mInverted[1])) {
        const streetPart = mInverted[1].trim();
        const housePart = mInverted[2].trim();
        const restPart = mInverted[3].trim();
        addr = `${housePart} ${streetPart}${restPart ? ", " + restPart.replace(/^[,.\s]+/, "") : ""}`;
      }
    }
    addr = addr.replace(/\s{2,}/g, " ").replace(/^[,.\s-]+|[,.\s-]+$/g, "").trim();
    const clusterRaw = extractClusterName(addr);
    const streetName = clusterRaw.replace(/^(?:đường|phố)\s+/i, "").trim();
    let houseNumber = "";
    let houseNumVal = 999999;
    let hasHouseNumber = false;
    let addrForHouseNum = addr.replace(/(?:tầng|lầu|phòng|p\.|căn\s*hộ|block|lô)\s*[\d\w-]+\s*,?\s*/gi, "");
    const mNum = addrForHouseNum.match(/^(?:số|nhà|sô)?\s*([\d]+[a-zA-Z]*(?:[\/\-][\d]+[a-zA-Z]*)*(?:\s*[\/\-]\s*[\d]+[a-zA-Z]*)*)/i);
    if (mNum) {
      houseNumber = mNum[1].replace(/\s+/g, "");
      const firstDigits = houseNumber.match(/\d+/);
      if (firstDigits) {
        houseNumVal = parseInt(firstDigits[0], 10);
        hasHouseNumber = true;
      }
    } else if (matchedLandmark) {
      houseNumber = matchedLandmark.houseNumber;
      const firstDigits = houseNumber.match(/\d+/);
      houseNumVal = firstDigits ? parseInt(firstDigits[0], 10) : 999999;
      hasHouseNumber = true;
    }
    if (!hasHouseNumber) {
      warningFlags.push("missing_house_number");
    }
    let locationFingerprint = "";
    if (matchedLandmark) {
      locationFingerprint = "bld_" + matchedLandmark.key;
    } else {
      const cleanStKey = removeDiacritics(streetName).toLowerCase().replace(/[^a-z0-9]/g, "");
      const cleanHouseKey = houseNumber.toLowerCase().replace(/[^a-z0-9]/g, "");
      const mDist = addr.match(/\b(?:quận|q\.?|huyện)\s*(\d+|[a-zà-ỹ]+)\b/i);
      const distKey = mDist ? "_q" + removeDiacritics(mDist[1]).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
      if (cleanStKey && cleanHouseKey) {
        locationFingerprint = `addr_${cleanHouseKey}_${cleanStKey}${distKey}`;
      } else if (cleanStKey) {
        locationFingerprint = `street_${cleanStKey}${distKey}`;
      } else {
        locationFingerprint = `raw_${Math.abs(hashString(addr))}`;
      }
    }
    return {
      cleanAddress: addr,
      street: streetName,
      clusterGroup: clusterRaw,
      houseNumber,
      houseNumVal,
      hasHouseNumber,
      buildingName: matchedLandmark ? matchedLandmark.names[0] : "",
      landmarkKey: matchedLandmark ? matchedLandmark.key : null,
      landmarkCoords: matchedLandmark ? { lat: matchedLandmark.lat, lng: matchedLandmark.lng } : null,
      locationFingerprint,
      secondaryPhone,
      extraNotes,
      warningFlags
    };
  }
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }
  function detectCoordinateOutliers(orders) {
    if (!orders || orders.length === 0) return [];
    const outliers = [];
    const streetCoords = {};
    const validTripCoords = [];
    orders.forEach((o) => {
      o.isGpsOutlier = false;
      o.gpsOutlierDist = 0;
      if (isValidCoord(o.lat, o.lng)) {
        const pInfo = o.parsedGeo || parseAndNormalizeAddress(o.address);
        const st = pInfo.street || "Ch\u01B0a r\xF5 \u0111\u01B0\u1EDDng";
        if (!streetCoords[st]) streetCoords[st] = [];
        streetCoords[st].push({ lat: Number(o.lat), lng: Number(o.lng), order: o });
        validTripCoords.push({ lat: Number(o.lat), lng: Number(o.lng) });
      }
    });
    let tripMedianLat = null;
    let tripMedianLng = null;
    if (validTripCoords.length >= 3) {
      validTripCoords.sort((a, b) => a.lat - b.lat);
      const mid = Math.floor(validTripCoords.length / 2);
      tripMedianLat = validTripCoords[mid].lat;
      tripMedianLng = validTripCoords[mid].lng;
    }
    const streetMedians = {};
    for (const st in streetCoords) {
      const list = streetCoords[st];
      if (list.length >= 1) {
        list.sort((a, b) => a.lat - b.lat);
        const mid = Math.floor(list.length / 2);
        const medLat = list[mid].lat;
        const medLng = list[mid].lng;
        streetMedians[st] = { lat: medLat, lng: medLng };
        if (list.length >= 2) {
          list.forEach((item) => {
            const dist = getCoordDistanceMeters(item.lat, item.lng, medLat, medLng);
            const threshold = list.length >= 4 ? 900 : 1400;
            if (dist > threshold) {
              item.order.isGpsOutlier = true;
              item.order.gpsOutlierDist = Math.round(dist);
              outliers.push(item.order);
            }
          });
        } else if (list.length === 1 && tripMedianLat != null) {
          const item = list[0];
          const distTrip = getCoordDistanceMeters(item.lat, item.lng, tripMedianLat, tripMedianLng);
          if (distTrip > 3500) {
            item.order.isGpsOutlier = true;
            item.order.gpsOutlierDist = Math.round(distTrip);
            outliers.push(item.order);
          }
        }
      }
    }
    orders.forEach((o) => {
      const pInfo = o.parsedGeo || parseAndNormalizeAddress(o.address);
      const st = pInfo.street || "Ch\u01B0a r\xF5 \u0111\u01B0\u1EDDng";
      if (streetMedians[st]) {
        o.streetMedianLat = streetMedians[st].lat;
        o.streetMedianLng = streetMedians[st].lng;
      } else if (tripMedianLat != null) {
        o.streetMedianLat = tripMedianLat;
        o.streetMedianLng = tripMedianLng;
      }
    });
    return outliers;
  }
  function healTripCoordinates(orders) {
    if (!orders || orders.length === 0) return { healedCount: 0, outlierCount: 0 };
    let healedCount = 0;
    orders.forEach((o) => {
      if (!o.parsedGeo) {
        o.parsedGeo = parseAndNormalizeAddress(o.address);
        o.locationFingerprint = o.parsedGeo.locationFingerprint;
        o.hasHouseNumber = o.parsedGeo.hasHouseNumber;
        if (o.parsedGeo.secondaryPhone && !o.secondaryPhone) {
          o.secondaryPhone = o.parsedGeo.secondaryPhone;
        }
        if (o.parsedGeo.extraNotes) {
          o.notes = o.notes ? o.notes + " | " + o.parsedGeo.extraNotes : o.parsedGeo.extraNotes;
        }
      }
    });
    orders.forEach((o) => {
      if (o.parsedGeo && o.parsedGeo.landmarkCoords) {
        const lm = o.parsedGeo.landmarkCoords;
        const needUpdate = !isValidCoord(o.lat, o.lng) || getCoordDistanceMeters(o.lat, o.lng, lm.lat, lm.lng) > 80;
        if (needUpdate) {
          o.lat = lm.lat;
          o.lng = lm.lng;
          o.isGpsOutlier = false;
          o.isGpsHealed = true;
          o.healedSource = "landmark_poi";
          healedCount++;
        }
      }
    });
    const outliers = detectCoordinateOutliers(orders);
    const fpGroups = {};
    orders.forEach((o) => {
      const fp = o.locationFingerprint;
      if (fp && !fp.startsWith("street_") && !fp.startsWith("raw_")) {
        if (!fpGroups[fp]) fpGroups[fp] = [];
        fpGroups[fp].push(o);
      }
    });
    for (const fp in fpGroups) {
      const grp = fpGroups[fp];
      const validLeader = grp.find((x) => isValidCoord(x.lat, x.lng) && !x.isGpsOutlier);
      if (validLeader) {
        const refLat = Number(validLeader.lat);
        const refLng = Number(validLeader.lng);
        grp.forEach((member) => {
          let needHeal = false;
          if (!isValidCoord(member.lat, member.lng) || member.isGpsOutlier) {
            needHeal = true;
          } else if (getCoordDistanceMeters(member.lat, member.lng, refLat, refLng) > 120) {
            needHeal = true;
          }
          if (needHeal && member !== validLeader) {
            member.lat = refLat;
            member.lng = refLng;
            member.isGpsOutlier = false;
            member.isGpsHealed = true;
            member.healedSource = "peer_snapping";
            healedCount++;
          }
        });
      }
    }
    const streetHouseData = {};
    orders.forEach((o) => {
      if (isValidCoord(o.lat, o.lng) && !o.isGpsOutlier && o.parsedGeo && o.parsedGeo.hasHouseNumber) {
        const st = o.parsedGeo.street;
        const numVal = o.parsedGeo.houseNumVal;
        if (numVal > 0 && numVal < 999999) {
          if (!streetHouseData[st]) streetHouseData[st] = [];
          streetHouseData[st].push({
            numVal,
            isEven: numVal % 2 === 0,
            lat: Number(o.lat),
            lng: Number(o.lng)
          });
        }
      }
    });
    orders.forEach((o) => {
      if ((!isValidCoord(o.lat, o.lng) || o.isGpsOutlier) && o.parsedGeo && o.parsedGeo.hasHouseNumber) {
        const st = o.parsedGeo.street;
        const targetVal = o.parsedGeo.houseNumVal;
        const targetEven = targetVal % 2 === 0;
        const candidates = streetHouseData[st];
        if (candidates && candidates.length >= 2) {
          const sameSide = candidates.filter((c) => c.isEven === targetEven);
          if (sameSide.length >= 2) {
            sameSide.sort((a, b) => a.numVal - b.numVal);
            let prev = null;
            let next = null;
            for (let i = 0; i < sameSide.length; i++) {
              if (sameSide[i].numVal < targetVal) prev = sameSide[i];
              if (sameSide[i].numVal > targetVal && !next) next = sameSide[i];
            }
            if (prev && next && next.numVal > prev.numVal) {
              let frac = (targetVal - prev.numVal) / (next.numVal - prev.numVal);
              frac = Math.max(0.05, Math.min(0.95, frac));
              o.lat = prev.lat + frac * (next.lat - prev.lat);
              o.lng = prev.lng + frac * (next.lng - prev.lng);
              o.isGpsOutlier = false;
              o.isGpsHealed = true;
              o.healedSource = "interpolation";
              healedCount++;
            }
          }
        }
      }
    });
    orders.forEach((o) => {
      if (!isValidCoord(o.lat, o.lng) || o.isGpsOutlier) {
        if (o.streetMedianLat && o.streetMedianLng) {
          o.lat = o.streetMedianLat;
          o.lng = o.streetMedianLng;
          o.isGpsOutlier = false;
          o.isGpsHealed = true;
          o.healedSource = o.parsedGeo && o.parsedGeo.hasHouseNumber ? "street_median_fallback" : "street_median";
          healedCount++;
        }
      }
    });
    return {
      healedCount,
      outlierCount: outliers.length
    };
  }

  // js/parser.js
  function removeDiacritics(str) {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
  }
  function normalizeAddress(addr) {
    if (!addr) return "";
    let s = addr.trim();
    s = s.replace(/^(?:địa\s*chỉ\s*(?:giao|nhận)?|đ\/c|address)\s*:\s*/i, "");
    s = s.replace(/[,.\s]*(?:Việt\s*Nam|Vietnam|VN)[\s.]*$/i, "");
    s = s.replace(/[,.\s]*\b\d{5,6}\b[\s.]*$/, "");
    const parts = s.split(",").map((p) => p.trim()).filter(Boolean);
    const cleanedParts = [];
    for (let i = 0; i < parts.length; i++) {
      let pClean = parts[i];
      if (i + 1 < parts.length) {
        const nextP = parts[i + 1];
        const mWard = nextP.match(/(?:phường|p\.)\s*(.+)/i);
        if (mWard) {
          const wardName = mWard[1].trim();
          const wardNoAccent = removeDiacritics(wardName).toLowerCase();
          const words = pClean.split(/\s+/);
          const wardWords = wardName.split(/\s+/);
          if (words.length > wardWords.length) {
            const tailNoAccent = removeDiacritics(words.slice(-wardWords.length).join(" ")).toLowerCase();
            if (tailNoAccent === wardNoAccent) {
              const remainder = words.slice(0, -wardWords.length).join(" ");
              if (!/^(?:số|nhà|hẻm|ngõ)?\s*[\d/]+[a-z\d-]*$/i.test(remainder)) {
                pClean = remainder;
              }
            }
          }
        }
      }
      for (let j = 0; j < cleanedParts.length; j++) {
        const prev = cleanedParts[j];
        if (prev.length >= 4) {
          const escaped = prev.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          pClean = pClean.replace(new RegExp("\\b" + escaped + "\\b", "gi"), "").trim();
        }
      }
      pClean = pClean.replace(/\s{2,}/g, " ").replace(/^[\s,.-]+|[\s,.-]+$/g, "");
      if (pClean && !cleanedParts.some((cp) => cp.toLowerCase() === pClean.toLowerCase())) {
        cleanedParts.push(pClean);
      }
    }
    let res = cleanedParts.join(", ");
    res = res.replace(/(?:TP\.?\s*Hồ\s*Chí\s*Minh|Thành\s*phố\s*Hồ\s*Chí\s*Minh|Hồ\s*Chí\s*Minh)/gi, "TP.HCM");
    res = res.replace(/(?:Thành\s*phố\s*Hà\s*Nội|TP\.?\s*Hà\s*Nội)/gi, "H\xE0 N\u1ED9i");
    res = res.replace(/(?:Thành\s*phố\s*Đà\s*Nẵng|TP\.?\s*Đà\s*Nẵng)/gi, "\u0110\xE0 N\u1EB5ng");
    res = res.replace(/\b(?:Ba|Bà),?\s*Huyện\s*Thanh\s*Quan\b/gi, "B\xE0 Huy\u1EC7n Thanh Quan");
    res = res.replace(/\bĐường\s+/gi, "");
    res = res.replace(/\bPhường\s+/gi, "P. ");
    res = res.replace(/\bQuận\s+/gi, "Q. ");
    res = res.replace(/\bThị\s*trấn\s+/gi, "TT. ");
    res = res.replace(/(?<!\bBà\s+)\bHuyện\s+/gi, "H. ");
    res = res.replace(/\s*,\s*/g, ", ");
    res = res.replace(/(?:,\s*)+/g, ", ");
    res = res.replace(/\s{2,}/g, " ");
    const tokens = res.split(", ").map((t) => t.trim()).filter(Boolean);
    const uniqueTokens = [];
    for (let k = 0; k < tokens.length; k++) {
      const t = tokens[k];
      if (uniqueTokens.length === 0 || uniqueTokens[uniqueTokens.length - 1].toLowerCase() !== t.toLowerCase()) {
        uniqueTokens.push(t);
      }
    }
    return uniqueTokens.join(", ");
  }
  function extractPhone(line) {
    if (!line) return null;
    if (/giao\s*thất\s*bại\s*thu|ghi\s*chú|lưu\s*ý/i.test(line)) return null;
    const candidate = line.match(/(?:\+?84|0|\(\+?84\)|\(0\d{1,4}\))[\s.-]*\d(?:[\s.-]*\d){4,10}\b/);
    if (candidate) {
      const raw = candidate[0];
      let digits = raw.replace(/[^\d+]/g, "");
      if (digits.startsWith("+84")) digits = "0" + digits.slice(3);
      else if (digits.startsWith("84") && digits.length >= 11) digits = "0" + digits.slice(2);
      if ((digits.length === 10 || digits.length === 11) && digits.startsWith("0")) {
        return { raw, phone: digits };
      }
    }
    return null;
  }
  function isTrackingCode(line) {
    if (!line) return false;
    const clean = line.trim();
    if (/^(?:mã\s*vận\s*đơn|ma\s*van\s*don|mã\s*đơn|tracking|mvd)\s*:/i.test(clean)) return true;
    if (/^(?:#|\d+\.\s*)?[A-Z0-9]{6,22}$/i.test(clean) && !/^0\d{8,11}$/.test(clean) && /[A-Za-z]/i.test(clean)) return true;
    return false;
  }
  function parseRawOrderText(rawText) {
    if (!rawText || !rawText.trim()) return [];
    const rawLines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let blocks = [];
    let curr = [];
    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      if (line.includes("	")) {
        if (curr.length > 0) {
          blocks.push(curr);
          curr = [];
        }
        blocks.push([line]);
        continue;
      }
      if (isTrackingCode(line) && curr.length > 0) {
        blocks.push(curr);
        curr = [];
      }
      curr.push(line);
    }
    if (curr.length > 0) blocks.push(curr);
    if (blocks.length === 0) blocks = [rawLines];
    const results = [];
    for (let b = 0; b < blocks.length; b++) {
      const bLines = blocks[b];
      if (bLines.length === 1 && bLines[0].includes("	")) {
        const rawCols = bLines[0].split("	").map((c) => c.trim());
        if (rawCols.length >= 11 && isTrackingCode(rawCols[1])) {
          const rawAddr = rawCols[5] || "";
          const ward = rawCols[6] || "";
          const district = rawCols[7] || "";
          const city = rawCols[8] || "";
          let fullAddr = rawAddr;
          if (ward && !fullAddr.toLowerCase().includes(ward.toLowerCase())) fullAddr += ", " + ward;
          if (district && !fullAddr.toLowerCase().includes(district.toLowerCase())) fullAddr += ", " + district;
          if (city && !fullAddr.toLowerCase().includes(city.toLowerCase())) fullAddr += ", " + city;
          const pGeo = parseAndNormalizeAddress(fullAddr);
          const ph = extractPhone(rawCols[4]);
          const phaiThu = parseMoneyCell({ v: rawCols[11] });
          const gtbThu = parseMoneyCell({ v: rawCols[12] });
          results.push({
            id: "ghn_" + Date.now() + "_" + b + "_" + Math.random().toString(36).substr(2, 5),
            trackingCode: rawCols[1].replace(/^[#\s]+|[.,\s]+$/g, ""),
            tripCode: rawCols[2] || "",
            customerName: (rawCols[3] || "Kh\xE1ch l\u1EBB").replace(/[<>]/g, "").trim(),
            phone: ph ? ph.phone : pGeo.secondaryPhone || (rawCols[4] || "").replace(/[^\d+]/g, "").trim(),
            secondaryPhone: pGeo.secondaryPhone,
            address: pGeo.cleanAddress || normalizeAddress(fullAddr),
            codAmount: phaiThu,
            phaiThu,
            gtbThu,
            notes: pGeo.extraNotes || "",
            status: "pending",
            groupId: "group_ungrouped",
            lat: rawCols[9] ? Number(rawCols[9]) : pGeo.landmarkCoords ? pGeo.landmarkCoords.lat : null,
            lng: rawCols[10] ? Number(rawCols[10]) : pGeo.landmarkCoords ? pGeo.landmarkCoords.lng : null,
            locationFingerprint: pGeo.locationFingerprint,
            hasHouseNumber: pGeo.hasHouseNumber,
            parsedGeo: pGeo,
            createdAt: (/* @__PURE__ */ new Date()).toISOString()
          });
          continue;
        }
        const cols = rawCols.filter(Boolean);
        const tItem = {
          trackingCode: "",
          customerName: "",
          phone: "",
          address: "",
          codAmount: 0,
          phaiThu: 0,
          gtbThu: 0,
          notes: "",
          status: "pending",
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        for (let c = 0; c < cols.length; c++) {
          const col = cols[c];
          const ph = extractPhone(col);
          if (ph && !tItem.phone) {
            tItem.phone = ph.phone;
          } else if (isTrackingCode(col) && !tItem.trackingCode) {
            tItem.trackingCode = col.replace(/^(?:mã\s*vận\s*đơn|ma\s*van\s*don|tracking|mvd)\s*:\s*/i, "").replace(/^[#\s]+|[.,\s]+$/g, "");
          } else if (/(?:đường|phường|quận|huyện|tp|tỉnh|ấp|xã|toà|tòa|số|kdc|khu|p\.|q\.)/i.test(col) && !tItem.address) {
            tItem.address = normalizeAddress(col);
          } else if (/^\d[\d.,\s]*(?:vnđ|đ|vnd|k)?\.?$/i.test(col) && !tItem.codAmount && !/^\d{1,2}\.\d{4,}$/.test(col)) {
            const numM = col.match(/\d[\d.,]*/);
            if (numM) {
              let val = parseInt(numM[0].replace(/[^\d]/g, ""), 10);
              if (/k/i.test(col) && val < 1e3) val *= 1e3;
              tItem.codAmount = isNaN(val) ? 0 : val;
              tItem.phaiThu = tItem.codAmount;
            }
          } else if (!tItem.customerName) {
            tItem.customerName = col.replace(/[<>]/g, "").trim();
          }
        }
        if (tItem.trackingCode || tItem.customerName || tItem.phone || tItem.address) {
          results.push(tItem);
        }
        continue;
      }
      const item = {
        trackingCode: "",
        customerName: "",
        phone: "",
        address: "",
        codAmount: 0,
        notes: "",
        status: "pending",
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const addrParts = [];
      for (let l = 0; l < bLines.length; l++) {
        const line = bLines[l];
        if (/^\(.*\)$/.test(line) || /giao\s*thất\s*bại\s*thu|ghi\s*chú|lưu\s*ý|thu\s*người\s*nhận|cho\s*khách\s*kiểm|gọi\s*trước/i.test(line)) {
          item.notes = line.trim();
          continue;
        }
        if (!item.trackingCode && isTrackingCode(line)) {
          const p = line.split(/:(.+)/);
          const code = p[1] ? p[1].trim() : line.trim();
          item.trackingCode = code.replace(/^[#\s]+|[.,\s]+$/g, "");
          continue;
        }
        const ph = extractPhone(line);
        if (ph && !item.phone) {
          item.phone = ph.phone;
          const remText = line.replace(ph.raw, "").replace(/[<>:,()-]/g, "").trim();
          if (remText && !item.customerName) {
            item.customerName = remText;
          }
          continue;
        }
        if (/^(?:tên|khách\s*hàng|người\s*nhận)\s*:/i.test(line)) {
          const p = line.split(/:(.+)/);
          if (p[1]) item.customerName = p[1].replace(/[<>]/g, "").trim();
          continue;
        }
        if (/(?:giá\s*tiền|tiền|cod|giá)\s*[:\s]*\d/i.test(line) || /^\d[\d.,\s]*(?:vnđ|đ|vnd|k)\.?$/i.test(line) || line === "0" || line === "0 VN\u0110" || line === "0\u0111") {
          const numMatch = line.match(/\d[\d.,]*/);
          if (numMatch) {
            let num = parseInt(numMatch[0].replace(/[^\d]/g, ""), 10);
            if (/k/i.test(line) && num < 1e3) num *= 1e3;
            item.codAmount = isNaN(num) ? 0 : num;
          }
          continue;
        }
        if (/^(?:địa\s*chỉ|đ\/c|address)\s*:/i.test(line)) {
          const p = line.split(/:(.+)/);
          if (p[1]) addrParts.push(p[1].trim());
          continue;
        }
        if (/(?:đường|phường|quận|huyện|thành phố|tp|tỉnh|ấp|xã|tòa|toà|số|centec|kdc|khu|p\.|q\.)/i.test(line)) {
          addrParts.push(line);
          continue;
        }
        if (!item.customerName) {
          item.customerName = line.replace(/[<>]/g, "").trim();
        } else {
          addrParts.push(line);
        }
      }
      if (addrParts.length > 0) {
        item.address = normalizeAddress(addrParts.join(", "));
      }
      if (item.trackingCode || item.customerName || item.phone || item.address) {
        if (item.address) {
          const pGeo = parseAndNormalizeAddress(item.address);
          item.address = pGeo.cleanAddress;
          item.locationFingerprint = pGeo.locationFingerprint;
          item.hasHouseNumber = pGeo.hasHouseNumber;
          item.parsedGeo = pGeo;
          if (pGeo.secondaryPhone && !item.phone) {
            item.phone = pGeo.secondaryPhone;
          } else if (pGeo.secondaryPhone) {
            item.secondaryPhone = pGeo.secondaryPhone;
          }
          if (pGeo.extraNotes) {
            item.notes = item.notes ? item.notes + " | " + pGeo.extraNotes : pGeo.extraNotes;
          }
          if (pGeo.landmarkCoords) {
            item.lat = pGeo.landmarkCoords.lat;
            item.lng = pGeo.landmarkCoords.lng;
            item.isGpsHealed = true;
            item.healedSource = "landmark_poi";
          }
        }
        results.push(item);
      }
    }
    return results;
  }
  function parseCurrency(str) {
    if (!str) return 0;
    const cleaned = str.replace(/[^\d]/g, "");
    const num = parseInt(cleaned, 10);
    return isNaN(num) ? 0 : num;
  }
  function formatCurrency(amount) {
    const num = typeof amount === "number" ? amount : parseInt(amount, 10) || 0;
    return new Intl.NumberFormat("vi-VN").format(num) + " \u0111";
  }
  var GOOGLE_SHEET_ID = "17jlmfVycw4L0ozXEPW878dkSPdkSM9Ny5eby9XTUCcs";
  function extractTripCode(str) {
    if (!str) return "";
    const clean = str.trim();
    const m = clean.match(/(?:trip-detail\/|tripCode=|\/)([A-Z0-9]{10,25})/i);
    if (m) return m[1];
    const mCode = clean.match(/[A-Z0-9]{10,25}/i);
    return mCode ? mCode[0] : clean;
  }
  function removeVietnameseTones(str) {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
  }
  var COMPREHENSIVE_STREETS = [
    // Tuyến đường huyết mạch Quận 3 & khu vực giao hàng GHN
    "V\xF5 V\u0103n T\u1EA7n",
    "Nguy\u1EC5n \u0110\xECnh Chi\u1EC3u",
    "C\xE1ch M\u1EA1ng Th\xE1ng 8",
    "Tr\u1EA7n Qu\u1ED1c Th\u1EA3o",
    "Cao Th\u1EAFng",
    "Nguy\u1EC5n Gia Thi\u1EC1u",
    "Nguy\u1EC5n Th\u1ECB Di\u1EC7u",
    "Nguy\u1EC5n S\u01A1n H\xE0",
    "Nguy\u1EC5n Th\u01B0\u1EE3ng Hi\u1EC1n",
    "\u0110i\u1EC7n Bi\xEAn Ph\u1EE7",
    "L\xEA Qu\xFD \u0110\xF4n",
    "L\xFD Ch\xEDnh Th\u1EAFng",
    "B\xE0 Huy\u1EC7n Thanh Quan",
    "Nam K\u1EF3 Kh\u1EDFi Ngh\u0129a",
    "Hai B\xE0 Tr\u01B0ng",
    "H\u1ED3 Xu\xE2n H\u01B0\u01A1ng",
    "Ph\u1EA1m \u0110\xECnh To\xE1i",
    "L\xEA Ng\xF4 C\xE1t",
    "Tr\u01B0\u01A1ng \u0110\u1ECBnh",
    "Nguy\u1EC5n Th\xF4ng",
    "S\u01B0 Thi\u1EC7n Chi\u1EBFu",
    "V\xF5 Th\u1ECB S\xE1u",
    "Nguy\u1EC5n Thi\u1EC7n Thu\u1EADt",
    "B\xE0n C\u1EDD",
    "V\u01B0\u1EDDn Chu\u1ED1i",
    "L\xEA V\u0103n S\u1EF9",
    "K\u1EF3 \u0110\u1ED3ng",
    "R\u1EA1ch B\xF9ng Binh",
    "Tr\u1EA7n V\u0103n \u0110ang",
    "Tr\u01B0\u01A1ng Quy\u1EC1n",
    "Ph\u1EA1m Ng\u1ECDc Th\u1EA1ch",
    "Pasteur",
    "Tr\u1EA7n Quang Di\u1EC7u",
    "Hu\u1EF3nh T\u1ECBnh C\u1EE7a",
    "L\xFD Th\xE1i T\u1ED5",
    "Tr\u1EA7n Cao V\xE2n",
    "C\xF4ng Tr\u01B0\u1EDDng Qu\u1ED1c T\u1EBF",
    "Ng\xF4 Th\u1EDDi Nhi\u1EC7m",
    "Tr\u1EA7n Qu\u1ED1c To\u1EA3n",
    "T\xFA X\u01B0\u01A1ng",
    "Nguy\u1EC5n V\u0103n Mai",
    "\u0110o\xE0n C\xF4ng B\u1EEDu",
    "Tr\u1EA7n Quang Kh\u1EA3i",
    // Quận 1 & lân cận
    "Nguy\u1EC5n Th\u1ECB Minh Khai",
    "L\xEA Du\u1EA9n",
    "\u0110\u1ED3ng Kh\u1EDFi",
    "Nguy\u1EC5n Hu\u1EC7",
    "L\xEA L\u1EE3i",
    "L\xFD T\u1EF1 Tr\u1ECDng",
    "H\xE0m Nghi",
    "B\u1EBFn V\xE2n \u0110\u1ED3n",
    "T\xF4n \u0110\u1EE9c Th\u1EAFng",
    "\u0110inh Ti\xEAn Ho\xE0ng",
    "Nguy\u1EC5n Du",
    "Phan Chu Trinh",
    "Phan B\u1ED9i Ch\xE2u",
    "M\u1EA1c \u0110\u0129nh Chi",
    "Ph\xF9ng Kh\u1EAFc Khoan",
    "Th\u1EA1ch Th\u1ECB Thanh",
    "Mai Th\u1ECB L\u1EF1u",
    "Nguy\u1EC5n V\u0103n Th\u1EE7",
    "Nguy\u1EC5n B\u1EC9nh Khi\xEAm",
    "Ho\xE0ng Sa",
    "Tr\u01B0\u1EDDng Sa",
    "C\u1ED1ng Qu\u1EF3nh",
    "B\xF9i Vi\u1EC7n",
    "Ph\u1EA1m Ng\u0169 L\xE3o",
    "\u0110\u1EC1 Th\xE1m",
    "Tr\u1EA7n H\u01B0ng \u0110\u1EA1o",
    "Nguy\u1EC5n Th\xE1i H\u1ECDc",
    "Calmette",
    "K\xFD Con",
    "Yersin",
    "C\xF4ng X\xE3 Paris",
    "C\xF4ng Tr\u01B0\u1EDDng Lam S\u01A1n",
    "C\xF4ng Tr\u01B0\u1EDDng M\xEA Linh",
    // Quận 10 & Tân Bình & Bình Thạnh
    "3 Th\xE1ng 2",
    "T\xF4 Hi\u1EBFn Th\xE0nh",
    "Th\xE0nh Th\xE1i",
    "S\u01B0 V\u1EA1n H\u1EA1nh",
    "Ng\xF4 Gia T\u1EF1",
    "L\xEA H\u1ED3ng Phong",
    "V\u0129nh Vi\u1EC5n",
    "Nguy\u1EC5n Tri Ph\u01B0\u01A1ng",
    "H\xF9ng V\u01B0\u01A1ng",
    "H\u1ED3ng B\xE0ng",
    "Nguy\u1EC5n Ch\xED Thanh",
    "B\u1EA1ch \u0110\u1EB1ng",
    "Phan \u0110\u0103ng L\u01B0u",
    "Ho\xE0ng V\u0103n Th\u1EE5",
    "C\u1ED9ng H\xF2a",
    "Tr\u01B0\u1EDDng Chinh",
    "L\u1EA1c Long Qu\xE2n",
    "\xC2u C\u01A1",
    "L\xEA \u0110\u1EA1i H\xE0nh",
    "Kha V\u1EA1n C\xE2n"
  ];
  function cleanAddressForClustering(raw) {
    if (!raw) return "";
    let addr = String(raw).normalize("NFC").trim();
    addr = addr.replace(/(?:\+?84|0|\(\+?84\)|\(0\d{1,4}\))[\s.-]*\d(?:[\s.-]*\d){4,10}\b/g, " ");
    addr = addr.replace(/\([^)]*\)/g, " ");
    addr = addr.replace(/^[^\w\d]*(?:đchi|đ\/c|địa\s*chỉ|ship|giao|đến|tại|em\s*check\s*lại\s*thử|đc\s*nhận\s*hàng|neu\s*giao|đc|dc)[^:]*:\s*/i, "");
    addr = addr.replace(/^ship\s+[^,]*?\s+(?:về|đến|tại)\s+/i, "");
    addr = addr.replace(/^[-–—\s*#]+/g, "");
    addr = addr.replace(/^[^\w\d]*(?:shop|cty|công\s*ty|báo|toà\s*nhà|tòa\s*nhà|building|tower|chi\s*nhánh|cn|nhà\s*hàng|coffe|cafe|viện|bv|bệnh\s*viện)\s+[^,]*?,\s*(?=\d)/i, "");
    addr = addr.replace(/^[^\w\d]*(?:shop|cty|công\s*ty|báo|toà\s*nhà|tòa\s*nhà|building|tower|chi\s*nhánh|cn|cổng\s*số\s*\d+)\s+[^,]*?\s+(?=\d)/i, "");
    const addrCheck = addr.replace(/(?:phường|p\.|p\s+|f\.?)\s*(?:võ\s*thị\s*sáu|nguyễn\s*cư\s*trinh|phạm\s*ngũ\s*lão)\b/gi, " ");
    let hasStreetAlready = false;
    const tempNoTone = removeVietnameseTones(addrCheck);
    for (const stItem of COMPREHENSIVE_STREETS) {
      if (new RegExp("\\b" + removeVietnameseTones(stItem) + "\\b", "i").test(tempNoTone)) {
        hasStreetAlready = true;
        break;
      }
    }
    if (!hasStreetAlready) {
      if (/master\s*building/i.test(addr)) {
        addr = "41-43 Tr\u1EA7n Cao V\xE2n, " + addr;
      } else if (/an\s*ph[uú]\s*plaza/i.test(addr)) {
        addr = "117 L\xFD Ch\xEDnh Th\u1EAFng, " + addr;
      } else if (/ns\s*t[aâ]n\s*đ[iị]nh|nh[aà]\s*s[aá]ch\s*t[aâ]n\s*đ[iị]nh/i.test(addr)) {
        addr = "387 Hai B\xE0 Tr\u01B0ng, " + addr;
      } else if (/b(?:v|ệnh\s*viện)\s*da\s*li[eễ]u/i.test(addr)) {
        addr = "69b Ng\xF4 Th\u1EDDi Nhi\u1EC7m, " + addr;
      } else if (/b(?:v|ệnh\s*viện)\s*y\s*h[oọ]c\s*c[oổ]\s*truy[eề]n/i.test(addr)) {
        addr = "179 Nam K\u1EF3 Kh\u1EDFi Ngh\u0129a, " + addr;
      } else if (/sawaco|daikin|h[oồ]\s*con\s*r[uù]a/i.test(addr)) {
        addr = "C\xF4ng Tr\u01B0\u1EDDng Qu\u1ED1c T\u1EBF, " + addr;
      }
    }
    addr = addr.replace(/\bCMT8\b/gi, "C\xE1ch M\u1EA1ng Th\xE1ng 8");
    addr = addr.replace(/\bcm\s*th[aá]ng\s*8\b/gi, "C\xE1ch M\u1EA1ng Th\xE1ng 8");
    addr = addr.replace(/\bC[aá]ch\s*M[aạ]ng\s*T(?:8|ám)\b/gi, "C\xE1ch M\u1EA1ng Th\xE1ng 8");
    addr = addr.replace(/\bCách\s*Mạng\s*Tháng\s*(?:Tám|8)\b/gi, "C\xE1ch M\u1EA1ng Th\xE1ng 8");
    addr = addr.replace(/\bNTMK\b/gi, "Nguy\u1EC5n Th\u1ECB Minh Khai");
    addr = addr.replace(/\b(?:Võ|Vo)\s*(?:v|văn|van)?\s*(?:tần|tan|tang|tầng)\b/gi, "V\xF5 V\u0103n T\u1EA7n");
    addr = addr.replace(/\bVO\s*V\s*TANG\b/gi, "V\xF5 V\u0103n T\u1EA7n");
    addr = addr.replace(/\b(?:3\s*tháng\s*2|3\/2)\b/gi, "3 Th\xE1ng 2");
    addr = addr.replace(/\bNam\s*K[iì]\s*(?:Kh[oở]i\s*Ngh[iĩ]a)?\b/gi, "Nam K\u1EF3 Kh\u1EDFi Ngh\u0129a");
    addr = addr.replace(/\bn\s*k\s*kh[oở]i\s*n[fgh]+[iĩ]a[x]?\b/gi, "Nam K\u1EF3 Kh\u1EDFi Ngh\u0129a");
    addr = addr.replace(/\bPhạm\s*Ngọc\s*Thạnh\b/gi, "Ph\u1EA1m Ng\u1ECDc Th\u1EA1ch");
    addr = addr.replace(/\bpham\s*ngoc\s*thanh\b/gi, "Ph\u1EA1m Ng\u1ECDc Th\u1EA1ch");
    addr = addr.replace(/\bcong\s*truong\s*quoc\s*te\b/gi, "C\xF4ng Tr\u01B0\u1EDDng Qu\u1ED1c T\u1EBF");
    addr = addr.replace(/\btu\s*xuong\b/gi, "T\xFA X\u01B0\u01A1ng");
    const rawNoTone = removeVietnameseTones(addr);
    if (rawNoTone.includes("xuan ha") && (rawNoTone.includes("p5") || rawNoTone.includes("phuong 5") || rawNoTone.includes("q3") || rawNoTone.includes("quan 3"))) {
      addr = addr.replace(/xuan\s*ha/gi, "S\u01A1n H\xE0").replace(/xuân\s*hà/gi, "S\u01A1n H\xE0");
    }
    if (rawNoTone.includes("nguyen gia thieu")) {
      addr = addr.replace(/nguy[eên\s]*gia\s*thi[eêú]+/gi, "Nguy\u1EC5n Gia Thi\u1EC1u");
    }
    if (rawNoTone.includes("nguyen thuong hien")) {
      addr = addr.replace(/nguy[eên\s]*th[uưoơng\s]*hi[eên]+/gi, "Nguy\u1EC5n Th\u01B0\u1EE3ng Hi\u1EC1n");
    }
    addr = addr.replace(/^(?:đc|đ\/c|địa\s*chỉ)?\s*(?:số|nhà|số\s*nhà|sô|sn|so)\s*[:\s]*([\d/]+[a-zA-Z]*(?:\s*bis)?)\s*[,.\s]+/i, "$1 ");
    addr = addr.replace(/^(\d+)\s+(\d+)\s+(?=[A-ZÀ-Ỹa-zà-ỹ])/i, "$1-$2 ");
    addr = addr.replace(/^([\d/]+[a-zA-Z]*)\s+\1\s+/i, "$1 ");
    for (const stItem of COMPREHENSIVE_STREETS) {
      const escSt = stItem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regRepeat = new RegExp("^\\s*(?:\u0111\u01B0\u1EDDng|ph\u1ED1)?\\s*" + escSt + "\\s+([\\d/]+[a-zA-Z]*(?:\\s*bis)?)\\s+(?:\u0111\u01B0\u1EDDng|ph\u1ED1)?\\s*" + escSt, "i");
      if (regRepeat.test(addr)) {
        addr = addr.replace(regRepeat, "$1 " + stItem);
      }
      const regPrefix = new RegExp("^\\s*(?:\u0111\u01B0\u1EDDng|ph\u1ED1)?\\s*" + escSt + "\\s+([\\d/]+[a-zA-Z]*(?:\\s*bis)?)(.*)$", "i");
      const mP = addr.match(regPrefix);
      if (mP) {
        addr = mP[1] + " " + stItem + (mP[2] ? " " + mP[2] : "");
      }
    }
    addr = addr.replace(/\bsố\s*năm\b/gi, "5");
    addr = addr.replace(/\bsố\s*một\b/gi, "1");
    addr = addr.replace(/(\d+)([a-zA-ZÀ-Ỹà-ỹ]{2,})/g, "$1 $2");
    addr = addr.replace(/,\s*(?:Phường|P\.?|F\.?)\s*(?:\d+|[A-ZÀ-Ỹa-zà-ỹ0-9\s]+?)(?:,\s*(?:Quận|Q\.?)\s*(?:\d+|[A-ZÀ-Ỹa-zà-ỹ0-9\s]+?))?(?:,\s*(?:TP\.?|Thành phố|Hồ Chí Minh|HCM|TPHCM)[^,]*)?$/gi, "");
    addr = addr.replace(/\s+(?:p\.?\s*\d+|phường\s*\d+|f\d+)(?:\s*,?\s*(?:q\.?\s*\d+|quan\s*\d+))?(?:\s*,?\s*(?:tphcm|hcm))?\s*$/gi, "");
    addr = addr.replace(/\s+(?:q\.?\s*\d+|quan\s*\d+)(?:\s*,?\s*(?:tphcm|hcm))?\s*$/gi, "");
    return addr.replace(/\s{2,}/g, " ").trim();
  }
  function extractClusterName(address, ward, district) {
    if (!address) return "Ch\u01B0a ph\xE2n nh\xF3m";
    const clean = cleanAddressForClustering(address);
    const addrNoTone = removeVietnameseTones(clean);
    const sortedStreets = COMPREHENSIVE_STREETS.slice().sort((a, b) => b.length - a.length);
    for (const st of sortedStreets) {
      const stNoTone = removeVietnameseTones(st);
      const reg = new RegExp("\\b" + stNoTone + "\\b", "i");
      if (reg.test(addrNoTone)) {
        return "\u0110\u01B0\u1EDDng " + st;
      }
    }
    const mDuong = clean.match(/(?:đường|phố|đ\.|đg\.)\s+([^,]+)/i);
    if (mDuong) {
      let stFound = mDuong[1].trim();
      stFound = stFound.replace(/(?:tòa\s*(?:nhà)?|toà\s*(?:nhà)?|chung\s*cư|cao\s*ốc|building|tower).*$/i, "").trim();
      stFound = stFound.replace(/\s+(?:thuộc|ở|tại)?\s*(?:p\.?\s*\d+|phường\s*\d+|f\d+|q\.?\s*\d+|quan\s*\d+).*$/i, "").trim();
      stFound = stFound.replace(/[-–—.,\s]+$/g, "").trim();
      if (stFound.length >= 2 && !/^(?:hồ chí minh|tphcm|vietnam|việt nam)$/i.test(stFound)) {
        return "\u0110\u01B0\u1EDDng " + capitalizeWords(stFound);
      }
    }
    const mNum = clean.match(/^(?:số\s*)?[\d/]+(?:-[\d/]+)?[a-zA-Z]*(?:\s*bis)?\s*[,.\s]+\s*([^,]+)/i);
    if (mNum) {
      let stAfterNum = mNum[1].trim();
      stAfterNum = stAfterNum.replace(/\s+(?:thuộc|ở|tại)?\s*(?:p\.?\s*\d+|phường\s*\d+|f\d+|q\.?\s*\d+|quan\s*\d+).*$/i, "").trim();
      stAfterNum = stAfterNum.replace(/[-–—.,\s]+$/g, "").trim();
      if (stAfterNum.length >= 2 && !/^(?:hồ chí minh|tphcm|vietnam|việt nam)$/i.test(stAfterNum)) {
        return "\u0110\u01B0\u1EDDng " + capitalizeWords(stAfterNum);
      }
    }
    if (ward || district) {
      const area = [];
      if (ward) area.push(ward.startsWith("Ph\u01B0\u1EDDng") || ward.startsWith("P.") ? ward : "Ph\u01B0\u1EDDng " + ward);
      if (district) area.push(district.startsWith("Qu\u1EADn") || district.startsWith("Q.") ? district : "Qu\u1EADn " + district);
      return area.join(", ");
    }
    return "Ch\u01B0a ph\xE2n nh\xF3m";
  }
  function extractStreetAndHouseNumber(addr) {
    if (!addr) {
      return { street: "Ch\u01B0a r\xF5 \u0111\u01B0\u1EDDng", clusterGroup: "Ch\u01B0a ph\xE2n nh\xF3m", houseNumber: "", houseNumVal: 999999, shortStreet: "" };
    }
    const streetRaw = extractClusterName(addr);
    const street = streetRaw.replace(/^Đường\s+/i, "").trim();
    const words = street.split(/\s+/).filter(Boolean);
    const shortStreet = words.length > 2 ? words.map((w) => w.charAt(0).toUpperCase()).join("") : street;
    let s = String(addr).trim();
    s = s.replace(/(?:\+?84|0|\(\+?84\)|\(0\d{1,4}\))[\s.-]*\d(?:[\s.-]*\d){4,10}\b/g, " ");
    s = s.replace(/\([^)]*\)/g, " ");
    s = s.replace(/^(?:địa\s*chỉ\s*(?:giao|nhận)?|đ\/c|address)\s*:\s*/i, "");
    s = s.replace(/(?:tầng|lầu|phòng|p\.|căn\s*hộ|block|lô)\s*[\d\w-]+\s*,?\s*/gi, "");
    s = s.replace(/(\d+)([a-zA-ZÀ-Ỹà-ỹ]{2,})/g, "$1 $2");
    const streetEsc = street.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let houseNumber = "";
    const regRepeat = new RegExp("^\\s*(?:\u0111\u01B0\u1EDDng|ph\u1ED1)?\\s*" + streetEsc + "\\s+([\\d/]+[a-zA-Z]*(?:\\s*bis)?)(?:\\D|$)", "i");
    const mRepeat = s.match(regRepeat);
    if (mRepeat) {
      houseNumber = mRepeat[1].trim();
    } else {
      const regBefore = new RegExp("(?:^|[,\\s])([\\d/]+[a-zA-Z]*(?:\\s*bis)?)\\s*(?:\u0111\u01B0\u1EDDng|ph\u1ED1)?\\s*" + streetEsc, "i");
      const mBefore = s.match(regBefore);
      if (mBefore) {
        houseNumber = mBefore[1].trim();
      } else {
        const sClean = s.replace(/^(?:đc|đ\/c|địa\s*chỉ)?\s*(?:số|nhà|số\s*nhà|sô)\s*[:\s]*/i, "");
        const mNumHead = sClean.match(/^([\d]+[a-zA-Z]*(?:\s*bis)?(?:[\/\-][\d]+[a-zA-Z]*(?:\s*bis)?)*(?:\s*[\/\-]\s*[\d]+[a-zA-Z]*)*)/i);
        if (mNumHead) {
          houseNumber = mNumHead[1].trim();
        } else {
          const mNumMid = s.match(/(?:số|nhà|số\s*nhà)\s*[:\s]*([\d/]+[a-zA-Z]*(?:\s*bis)?)/i);
          if (mNumMid) {
            houseNumber = mNumMid[1].trim();
          }
        }
      }
    }
    const firstDigits = houseNumber.match(/\d+/);
    const houseNumVal = firstDigits ? parseInt(firstDigits[0], 10) : 999999;
    return {
      street,
      clusterGroup: streetRaw,
      houseNumber,
      houseNumVal,
      shortStreet
    };
  }
  function capitalizeWords(str) {
    if (!str) return "";
    return str.toLowerCase().split(/\s+/).map((w) => w ? w.charAt(0).toUpperCase() + w.slice(1) : "").join(" ");
  }
  function parseMoneyCell(cell) {
    if (!cell) return 0;
    if (typeof cell.v === "number") return isNaN(cell.v) ? 0 : Math.round(cell.v);
    if (cell.v !== null && cell.v !== void 0 && cell.v !== "") {
      const rawStr = String(cell.v).replace(/[^\d]/g, "");
      const num = parseInt(rawStr, 10);
      if (!isNaN(num)) return num;
    }
    if (cell.f) {
      const fStr = String(cell.f).replace(/[^\d]/g, "");
      const fNum = parseInt(fStr, 10);
      if (!isNaN(fNum)) return fNum;
    }
    return 0;
  }
  function fetchOrdersByTrip(tripCode) {
    const cleanCode = extractTripCode(tripCode);
    if (!cleanCode) {
      return Promise.reject(new Error("M\xE3 chuy\u1EBFn kh\xF4ng h\u1EE3p l\u1EC7"));
    }
    const query = "select * where C = '" + cleanCode + "'";
    const gvizUrl = "https://docs.google.com/spreadsheets/d/" + GOOGLE_SHEET_ID + "/gviz/tq?tqx=out:json&tq=" + encodeURIComponent(query);
    return fetch(gvizUrl).then((res) => res.text()).then((text) => {
      const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
      if (!m) throw new Error("D\u1EEF li\u1EC7u tr\u1EA3 v\u1EC1 kh\xF4ng \u0111\xFAng \u0111\u1ECBnh d\u1EA1ng");
      return JSON.parse(m[1]);
    }).catch(() => {
      return new Promise((resolve, reject) => {
        const cbName = "gvizCb_" + Date.now() + "_" + Math.floor(Math.random() * 1e4);
        const timer = setTimeout(() => {
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error("H\u1EBFt th\u1EDDi gian ch\u1EDD ph\u1EA3n h\u1ED3i Google Sheet"));
        }, 15e3);
        window[cbName] = function(json) {
          clearTimeout(timer);
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(json);
        };
        const script = document.createElement("script");
        script.src = "https://docs.google.com/spreadsheets/d/" + GOOGLE_SHEET_ID + "/gviz/tq?tqx=responseHandler:" + cbName + "&tq=" + encodeURIComponent(query);
        script.onerror = () => {
          clearTimeout(timer);
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error("Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i \u0111\u1EBFn Google Sheet"));
        };
        document.body.appendChild(script);
      });
    }).then((data) => {
      if (!data || !data.table || !data.table.rows) {
        throw new Error("Kh\xF4ng t\xECm th\u1EA5y chuy\u1EBFn h\xE0ng");
      }
      const rows = data.table.rows;
      const mappedOrders = [];
      for (let i = 0; i < rows.length; i++) {
        const c = rows[i].c;
        if (!c) continue;
        const rawAddr = c[5] && c[5].v ? String(c[5].v) : "";
        const ward = c[6] && c[6].v ? String(c[6].v) : "";
        const district = c[7] && c[7].v ? String(c[7].v) : "";
        const city = c[8] && c[8].v ? String(c[8].v) : "";
        let fullAddr = rawAddr;
        if (ward && !fullAddr.toLowerCase().includes(ward.toLowerCase())) fullAddr += ", " + ward;
        if (district && !fullAddr.toLowerCase().includes(district.toLowerCase())) fullAddr += ", " + district;
        if (city && !fullAddr.toLowerCase().includes(city.toLowerCase())) fullAddr += ", " + city;
        const pGeo = parseAndNormalizeAddress(fullAddr);
        const rawPhone = c[4] && c[4].v ? String(c[4].v).replace(/[^\d+]/g, "").trim() : "";
        const ph = extractPhone(rawPhone);
        const phaiThu = parseMoneyCell(c[11]);
        const gtbThu = parseMoneyCell(c[12]);
        const orderItem = {
          id: "ghn_" + Date.now() + "_" + i + "_" + Math.random().toString(36).substr(2, 5),
          trackingCode: c[1] && c[1].v ? String(c[1].v).trim() : "\u0110\u01A0N_" + (i + 1),
          tripCode: cleanCode,
          customerName: c[3] && c[3].v ? String(c[3].v).replace(/[<>]/g, "").trim() : "Kh\xE1ch l\u1EBB",
          phone: ph ? ph.phone : pGeo.secondaryPhone || rawPhone,
          secondaryPhone: pGeo.secondaryPhone,
          address: pGeo.cleanAddress || normalizeAddress(fullAddr),
          codAmount: phaiThu,
          phaiThu,
          gtbThu,
          status: "pending",
          notes: pGeo.extraNotes || "",
          groupId: "group_ungrouped",
          lat: c[9] && c[9].v ? Number(c[9].v) : pGeo.landmarkCoords ? pGeo.landmarkCoords.lat : null,
          lng: c[10] && c[10].v ? Number(c[10].v) : pGeo.landmarkCoords ? pGeo.landmarkCoords.lng : null,
          locationFingerprint: pGeo.locationFingerprint,
          hasHouseNumber: pGeo.hasHouseNumber,
          parsedGeo: pGeo,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        if (pGeo.landmarkCoords && (!orderItem.lat || !orderItem.lng)) {
          orderItem.lat = pGeo.landmarkCoords.lat;
          orderItem.lng = pGeo.landmarkCoords.lng;
          orderItem.isGpsHealed = true;
          orderItem.healedSource = "landmark_poi";
        }
        mappedOrders.push(orderItem);
      }
      const healStats = healTripCoordinates(mappedOrders);
      return { tripCode: cleanCode, orders: mappedOrders, healStats };
    });
  }

  // js/app.js
  var currentOrders = [];
  var currentGroups = [];
  var activeFilter = "all";
  var activeTripFilter = "all";
  var searchQuery = "";
  var draggedOrderId = null;
  var allCollapsed = false;
  var desktopCurrentView = "list";
  var desktopMap = null;
  var desktopMapMarkers = {};
  var desktopRoutePolyline = null;
  var desktopUserMarker = null;
  var desktopUserAccuracy = null;
  var isDesktopPolylineVisible = true;
  var desktopMapTileMode = "osm";
  var desktopActiveTileLayer = null;
  var selectedDesktopOrderId = null;
  var targetUpdateOrder = null;
  var currentDesktopSyncTrip = "all";
  var ordersListEl = document.getElementById("ordersList");
  var emptyStateEl = document.getElementById("emptyState");
  var searchInput = document.getElementById("searchInput");
  var filterPills = document.querySelectorAll(".filter-pill");
  var statTotal = document.getElementById("statTotal");
  var statPending = document.getElementById("statPending");
  var statGtc = document.getElementById("statGtc");
  var statGtb = document.getElementById("statGtb");
  var statCod = document.getElementById("statCod");
  var manualForm = document.getElementById("manualOrderForm");
  var pasteForm = document.getElementById("pasteOrderForm");
  var smartPasteInput = document.getElementById("smartPasteInput");
  var pastePreviewSummary = document.getElementById("pastePreviewSummary");
  var tabButtons = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");
  var cleanModal = document.getElementById("cleanModal");
  var btnOpenCleanModal = document.getElementById("btnOpenCleanModal");
  var btnCancelClean = document.getElementById("btnCancelClean");
  var btnConfirmClean = document.getElementById("btnConfirmClean");
  var tripSyncModal = document.getElementById("tripSyncModal");
  var btnOpenTripModalDesktop = document.getElementById("btnOpenTripModalDesktop");
  var btnCancelTripModal = document.getElementById("btnCancelTripModal");
  var btnSubmitTripDesktop = document.getElementById("btnSubmitTripDesktop");
  var desktopTripInput = document.getElementById("desktopTripInput");
  var desktopTripStatus = document.getElementById("desktopTripStatus");
  var desktopTripAutoGroup = document.getElementById("desktopTripAutoGroup");
  var btnDesktopAutoGroup = document.getElementById("btnDesktopAutoGroup");
  var btnDesktopHealGps = document.getElementById("btnDesktopHealGps");
  var btnDesktopNewGroup = document.getElementById("btnDesktopNewGroup");
  var btnDesktopCollapseAll = document.getElementById("btnDesktopCollapseAll");
  document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
  });
  function initApp() {
    currentOrders = StorageService.loadSampleIfEmpty();
    currentGroups = StorageService.getGroups();
    ensureGroupIntegrity();
    renderApp();
  }
  function ensureGroupIntegrity() {
    if (!currentGroups || currentGroups.length === 0) {
      currentGroups = [{ id: "group_ungrouped", name: "Ch\u01B0a ph\xE2n nh\xF3m", isCollapsed: false }];
    }
    const hasUngrouped = currentGroups.some((g) => g.id === "group_ungrouped");
    if (!hasUngrouped) {
      currentGroups.unshift({ id: "group_ungrouped", name: "Ch\u01B0a ph\xE2n nh\xF3m", isCollapsed: false });
    }
    const usedGroupIds = new Set(currentOrders.map((o) => o.groupId).filter(Boolean));
    currentGroups = currentGroups.filter((g) => g.id === "group_ungrouped" || usedGroupIds.has(g.id));
    const groupIds = new Set(currentGroups.map((g) => g.id));
    let modified = false;
    currentOrders.forEach((o) => {
      if (!o.groupId || !groupIds.has(o.groupId)) {
        o.groupId = "group_ungrouped";
        modified = true;
      }
    });
    if (modified) {
      StorageService.saveOrders(currentOrders);
    }
    StorageService.saveGroups(currentGroups);
  }
  function setupEventListeners() {
    tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        tabButtons.forEach((b) => b.classList.remove("active"));
        tabPanels.forEach((p) => p.style.display = "none");
        btn.classList.add("active");
        const targetId = btn.getAttribute("data-tab");
        const targetPanel = document.getElementById(targetId);
        if (targetPanel) targetPanel.style.display = "block";
      });
    });
    if (manualForm) {
      manualForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const trackingCode = document.getElementById("inputTracking").value.trim();
        const customerName = document.getElementById("inputCustomer").value.trim();
        const phone = document.getElementById("inputPhone").value.trim();
        const address = document.getElementById("inputAddress").value.trim();
        const codRaw = document.getElementById("inputCod").value.trim();
        const newOrder = {
          trackingCode: trackingCode || "VNGH" + Math.floor(1e10 + Math.random() * 9e10),
          customerName,
          phone,
          address: normalizeAddress(address),
          codAmount: parseCurrency(codRaw),
          status: "pending",
          groupId: "group_ungrouped"
        };
        currentOrders = StorageService.addOrders([newOrder]);
        manualForm.reset();
        document.getElementById("inputCod").value = "0 VN\u0110";
        renderApp();
        showToast("\u0110\xE3 th\xEAm 1 \u0111\u01A1n h\xE0ng m\u1EDBi th\xE0nh c\xF4ng!", "success");
      });
    }
    if (smartPasteInput) {
      smartPasteInput.addEventListener("input", () => {
        const text = smartPasteInput.value.trim();
        if (!text) {
          pastePreviewSummary.classList.remove("active");
          return;
        }
        const parsedItems = parseRawOrderText(text);
        if (parsedItems.length > 0) {
          pastePreviewSummary.innerHTML = `
          <strong>\u0110\xE3 ph\xE1t hi\u1EC7n:</strong> ${parsedItems.length} \u0111\u01A1n h\xE0ng<br>
          <span style="font-size: 0.75rem; color: #64748b;">
            \u0110\u01A1n \u0111\u1EA7u ti\xEAn: ${escapeHtml(parsedItems[0].customerName || "Kh\xE1ch")} - ${escapeHtml(parsedItems[0].phone || "S\u0110T")} (${escapeHtml(parsedItems[0].address || "")})
          </span>
        `;
          pastePreviewSummary.classList.add("active");
        } else {
          pastePreviewSummary.innerHTML = `<em>Ch\u01B0a nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c c\u1EA5u tr\xFAc \u0111\u01A1n h\xE0ng...</em>`;
          pastePreviewSummary.classList.add("active");
        }
      });
    }
    if (pasteForm) {
      pasteForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = smartPasteInput.value.trim();
        if (!text) return;
        const newOrders = parseRawOrderText(text);
        if (newOrders.length === 0) {
          showToast("Kh\xF4ng nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c \u0111\u01A1n h\xE0ng n\xE0o. H\xE3y ki\u1EC3m tra l\u1EA1i n\u1ED9i dung d\xE1n!", "error");
          return;
        }
        currentOrders = StorageService.addOrders(newOrders);
        smartPasteInput.value = "";
        pastePreviewSummary.classList.remove("active");
        renderApp();
        showToast(`\u0110\xE3 th\xEAm th\xE0nh c\xF4ng ${newOrders.length} \u0111\u01A1n h\xE0ng!`, "success");
      });
    }
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderOrderList();
      });
    }
    filterPills.forEach((pill) => {
      pill.addEventListener("click", () => {
        filterPills.forEach((p) => p.classList.remove("active"));
        pill.classList.add("active");
        activeFilter = pill.getAttribute("data-filter");
        renderOrderList();
      });
    });
    setupCleanModal();
    setupTripModal();
    setupGroupToolbar();
    setupDesktopQrScanner();
    setupDesktopViewSwitcher();
    setupDesktopQrSync();
    setupDesktopTripFilter();
    setupDesktopUpdateLocationModal();
    setupDesktopUnmappedModal();
    setupDesktopAiRouteModal();
    setupDesktopFleetDispatch();
  }
  function setupCleanModal() {
    if (!btnOpenCleanModal || !cleanModal) return;
    const cleanTripSelect = document.getElementById("cleanTripSelect");
    const cleanPendingCount = document.getElementById("cleanPendingCount");
    const cleanFinishedCount = document.getElementById("cleanFinishedCount");
    const cleanAllTotalCount = document.getElementById("cleanAllTotalCount");
    btnOpenCleanModal.addEventListener("click", () => {
      if (currentOrders.length === 0) {
        showToast("Danh s\xE1ch \u0111\u01A1n \u0111ang tr\u1ED1ng, kh\xF4ng c\xF3 d\u1EEF li\u1EC7u \u0111\u1EC3 d\u1ECDn d\u1EB9p!", "info");
        return;
      }
      const totalOrders = currentOrders.length;
      const finishedCount = currentOrders.filter((o) => o.status === "gtc" || o.status === "gtb").length;
      const pendingCount = currentOrders.filter((o) => o.status === "pending").length;
      if (cleanAllTotalCount) cleanAllTotalCount.textContent = totalOrders;
      if (cleanFinishedCount) cleanFinishedCount.textContent = finishedCount;
      if (cleanPendingCount) cleanPendingCount.textContent = pendingCount;
      const tripCounts = {};
      currentOrders.forEach((o) => {
        const tc = o.tripCode || "Ch\u01B0a c\xF3 m\xE3 chuy\u1EBFn";
        tripCounts[tc] = (tripCounts[tc] || 0) + 1;
      });
      const tripKeys = Object.keys(tripCounts).sort();
      if (cleanTripSelect) {
        let tripOptionsHtml = "";
        tripKeys.forEach((k) => {
          tripOptionsHtml += `<option value="${escapeHtml(k)}">Chuy\u1EBFn ${escapeHtml(k)} (${tripCounts[k]} \u0111\u01A1n)</option>`;
        });
        cleanTripSelect.innerHTML = tripOptionsHtml;
        if (activeTripFilter !== "all" && tripKeys.includes(activeTripFilter)) {
          cleanTripSelect.value = activeTripFilter;
          const rTrip = document.querySelector('input[name="cleanMode"][value="trip"]');
          if (rTrip) rTrip.checked = true;
        } else {
          const rDefault = finishedCount > 0 ? document.querySelector('input[name="cleanMode"][value="finished"]') : document.querySelector('input[name="cleanMode"][value="all"]');
          if (rDefault) rDefault.checked = true;
        }
      }
      cleanModal.classList.add("show");
    });
    if (btnCancelClean) {
      btnCancelClean.addEventListener("click", () => {
        cleanModal.classList.remove("show");
      });
    }
    if (btnConfirmClean) {
      btnConfirmClean.addEventListener("click", () => {
        const modeRadio = document.querySelector('input[name="cleanMode"]:checked');
        const selectedMode = modeRadio ? modeRadio.value : "finished";
        if (selectedMode === "all") {
          const total = currentOrders.length;
          if (confirm(`\u26A0\uFE0F C\u1EA2NH B\xC1O QUAN TR\u1ECCNG:
B\u1EA1n c\xF3 ch\u1EAFc ch\u1EAFn mu\u1ED1n X\xD3A S\u1EA0CH TO\xC0N B\u1ED8 ${total} \u0111\u01A1n h\xE0ng trong h\u1EC7 th\u1ED1ng?
H\xE0nh \u0111\u1ED9ng n\xE0y kh\xF4ng th\u1EC3 ho\xE0n t\xE1c!`)) {
            currentOrders = [];
            currentGroups = [{ id: "group_ungrouped", name: "Ch\u01B0a ph\xE2n nh\xF3m", isCollapsed: false }];
            StorageService.saveOrders(currentOrders);
            StorageService.saveGroups(currentGroups);
            cleanModal.classList.remove("show");
            activeTripFilter = "all";
            renderApp();
            showToast(`\u{1F525} \u0110\xE3 x\xF3a s\u1EA1ch to\xE0n b\u1ED9 ${total} \u0111\u01A1n h\xE0ng trong h\u1EC7 th\u1ED1ng!`, "success");
          }
        } else if (selectedMode === "trip") {
          if (!cleanTripSelect || !cleanTripSelect.value) {
            showToast("Vui l\xF2ng ch\u1ECDn m\xE3 chuy\u1EBFn c\u1EA7n x\xF3a!", "error");
            return;
          }
          const tripToDelete = cleanTripSelect.value;
          const countToDelete = currentOrders.filter((o) => (o.tripCode || "Ch\u01B0a c\xF3 m\xE3 chuy\u1EBFn") === tripToDelete).length;
          if (confirm(`B\u1EA1n c\xF3 ch\u1EAFc mu\u1ED1n x\xF3a to\xE0n b\u1ED9 ${countToDelete} \u0111\u01A1n h\xE0ng c\u1EE7a chuy\u1EBFn "${tripToDelete}" kh\xF4ng?
C\xE1c \u0111\u01A1n c\u1EE7a c\xE1c chuy\u1EBFn kh\xE1c s\u1EBD \u0111\u01B0\u1EE3c gi\u1EEF nguy\xEAn.`)) {
            currentOrders = currentOrders.filter((o) => (o.tripCode || "Ch\u01B0a c\xF3 m\xE3 chuy\u1EBFn") !== tripToDelete);
            StorageService.saveOrders(currentOrders);
            ensureGroupIntegrity();
            cleanModal.classList.remove("show");
            if (activeTripFilter === tripToDelete) {
              activeTripFilter = "all";
            }
            renderApp();
            showToast(`\u26A1 \u0110\xE3 x\xF3a to\xE0n b\u1ED9 ${countToDelete} \u0111\u01A1n c\u1EE7a chuy\u1EBFn ${tripToDelete}!`, "success");
          }
        } else if (selectedMode === "finished") {
          const finishedCount = currentOrders.filter((o) => o.status === "gtc" || o.status === "gtb").length;
          if (finishedCount === 0) {
            showToast("Kh\xF4ng c\xF3 \u0111\u01A1n n\xE0o \u0111\xE3 x\u1EED l\xFD (GTC ho\u1EB7c GTB) \u0111\u1EC3 d\u1ECDn d\u1EB9p!", "info");
            return;
          }
          const pendingCount = currentOrders.filter((o) => o.status === "pending").length;
          if (confirm(`D\u1ECDn d\u1EB9p ${finishedCount} \u0111\u01A1n h\xE0ng \u0111\xE3 ho\xE0n t\u1EA5t (GTC/GTB)?
${pendingCount} \u0111\u01A1n ch\u1EDD giao v\u1EABn s\u1EBD \u0111\u01B0\u1EE3c gi\u1EEF l\u1EA1i.`)) {
            currentOrders = currentOrders.filter((o) => o.status === "pending");
            StorageService.saveOrders(currentOrders);
            ensureGroupIntegrity();
            cleanModal.classList.remove("show");
            renderApp();
            showToast(`\u2713 \u0110\xE3 d\u1ECDn d\u1EB9p ${finishedCount} \u0111\u01A1n h\xE0ng \u0111\xE3 giao xong!`, "success");
          }
        }
      });
    }
    window.addEventListener("click", (e) => {
      if (e.target === cleanModal) {
        cleanModal.classList.remove("show");
      }
    });
  }
  function setupTripModal() {
    if (!btnOpenTripModalDesktop) return;
    btnOpenTripModalDesktop.addEventListener("click", () => {
      desktopTripStatus.style.display = "none";
      tripSyncModal.style.display = "flex";
      desktopTripInput.focus();
    });
    if (btnCancelTripModal) {
      btnCancelTripModal.addEventListener("click", () => {
        tripSyncModal.style.display = "none";
      });
    }
    window.addEventListener("click", (e) => {
      if (e.target === tripSyncModal) {
        tripSyncModal.style.display = "none";
      }
    });
    if (btnSubmitTripDesktop) {
      btnSubmitTripDesktop.addEventListener("click", () => {
        const rawCode = desktopTripInput.value.trim();
        if (!rawCode) {
          showToast("Vui l\xF2ng nh\u1EADp M\xE3 Chuy\u1EBFn ho\u1EB7c link chuy\u1EBFn GHN!", "error");
          return;
        }
        desktopTripStatus.style.display = "block";
        desktopTripStatus.style.background = "#e0f2fe";
        desktopTripStatus.style.color = "#0369a1";
        desktopTripStatus.innerHTML = `\u23F3 \u0110ang k\u1EBFt n\u1ED1i Google Sheet l\u1EA5y \u0111\u01A1n chuy\u1EBFn <strong>${escapeHtml(rawCode)}</strong>...`;
        btnSubmitTripDesktop.disabled = true;
        fetchOrdersByTrip(rawCode).then((result) => {
          btnSubmitTripDesktop.disabled = false;
          if (result.orders.length === 0) {
            desktopTripStatus.style.background = "#fee2e2";
            desktopTripStatus.style.color = "#b91c1c";
            desktopTripStatus.innerHTML = `\u26A0\uFE0F Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n n\xE0o cho m\xE3 chuy\u1EBFn <strong>${escapeHtml(result.tripCode)}</strong>`;
            return;
          }
          const mode = document.querySelector('input[name="desktopTripMode"]:checked').value;
          if (mode === "replace") {
            currentOrders = result.orders;
            activeTripFilter = result.tripCode;
          } else {
            currentOrders = [...currentOrders, ...result.orders];
            activeTripFilter = result.tripCode;
          }
          StorageService.saveOrders(currentOrders);
          if (desktopTripAutoGroup && desktopTripAutoGroup.checked) {
            autoGroupAllOrders();
          } else {
            ensureGroupIntegrity();
            renderApp();
          }
          tripSyncModal.style.display = "none";
          const healedMsg = result.healStats && result.healStats.healedCount > 0 ? ` (\u26A1 \u0110\xE3 t\u1EF1 \u0111\u1ED9ng n\u1EAFn chu\u1EA9n ${result.healStats.healedCount} \u0111\u01A1n GPS)` : "";
          showToast(`\u0110\xE3 t\u1EA3i th\xE0nh c\xF4ng ${result.orders.length} \u0111\u01A1n h\xE0ng chuy\u1EBFn ${result.tripCode}!${healedMsg}`, "success");
        }).catch((err) => {
          btnSubmitTripDesktop.disabled = false;
          desktopTripStatus.style.background = "#fee2e2";
          desktopTripStatus.style.color = "#b91c1c";
          desktopTripStatus.innerHTML = `\u274C L\u1ED7i: ${escapeHtml(err.message || "Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i Google Sheet")}`;
        });
      });
    }
  }
  function setupGroupToolbar() {
    const btnSortStreet = document.getElementById("btnDesktopSortStreet");
    if (btnSortStreet) {
      btnSortStreet.addEventListener("click", sortOrdersByStreetAndHouseNumber);
    }
    if (btnDesktopAutoGroup) {
      btnDesktopAutoGroup.addEventListener("click", autoGroupAllOrders);
    }
    if (btnDesktopHealGps) {
      btnDesktopHealGps.addEventListener("click", healCurrentOrdersGPS);
    }
    if (btnDesktopNewGroup) {
      btnDesktopNewGroup.addEventListener("click", createNewGroup);
    }
    if (btnDesktopCollapseAll) {
      btnDesktopCollapseAll.addEventListener("click", toggleAllCollapse);
    }
  }
  function sortOrdersByStreetAndHouseNumber() {
    const targetOrders = getActiveTripOrders();
    if (targetOrders.length <= 1) {
      showToast("Ch\u01B0a c\xF3 \u0111\u1EE7 \u0111\u01A1n \u0111\u1EC3 s\u1EAFp x\u1EBFp l\u1ED9 tr\xECnh!", "info");
      return;
    }
    const analyzed = targetOrders.map((o, idx) => {
      const info = extractStreetAndHouseNumber(o.address);
      return {
        order: o,
        origIdx: idx,
        street: info.street,
        clusterGroup: info.clusterGroup,
        houseNumber: info.houseNumber,
        houseNumVal: info.houseNumVal,
        shortStreet: info.shortStreet
      };
    });
    const streetMap = {};
    const streetOrder = [];
    analyzed.forEach((item) => {
      const st = item.street;
      if (!streetMap[st]) {
        streetMap[st] = {
          street: st,
          clusterGroup: item.clusterGroup,
          items: [],
          firstIdx: item.origIdx
        };
        streetOrder.push(st);
      }
      streetMap[st].items.push(item);
    });
    streetOrder.sort((a, b) => {
      if (a === "Ch\u01B0a r\xF5 \u0111\u01B0\u1EDDng") return 1;
      if (b === "Ch\u01B0a r\xF5 \u0111\u01B0\u1EDDng") return -1;
      return streetMap[a].firstIdx - streetMap[b].firstIdx;
    });
    const sortedSubOrders = [];
    streetOrder.forEach((stKey) => {
      const grpObj = streetMap[stKey];
      grpObj.items.sort((a, b) => {
        if (a.houseNumVal !== b.houseNumVal) {
          return a.houseNumVal - b.houseNumVal;
        }
        return a.origIdx - b.origIdx;
      });
      let targetGroup = currentGroups.find(
        (g) => g.id !== "group_ungrouped" && g.name.trim().toLowerCase() === grpObj.clusterGroup.trim().toLowerCase()
      );
      if (!targetGroup) {
        const gId = "grp_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);
        targetGroup = {
          id: gId,
          name: grpObj.clusterGroup,
          isCollapsed: false
        };
        currentGroups.push(targetGroup);
      }
      grpObj.items.forEach((it) => {
        it.order.groupId = targetGroup.id;
        sortedSubOrders.push(it.order);
      });
    });
    if (activeTripFilter === "all") {
      currentOrders = sortedSubOrders;
    } else {
      const otherOrders = currentOrders.filter((o) => (o.tripCode || "Ch\u01B0a c\xF3 m\xE3 chuy\u1EBFn") !== activeTripFilter);
      currentOrders = [...otherOrders, ...sortedSubOrders];
    }
    const usedGroupIds = new Set(currentOrders.map((o) => o.groupId).filter(Boolean));
    currentGroups = currentGroups.filter((g) => g.id === "group_ungrouped" || usedGroupIds.has(g.id));
    StorageService.saveOrders(currentOrders);
    StorageService.saveGroups(currentGroups);
    renderApp();
    showToast(`\u26A1 \u0110\xE3 s\u1EAFp x\u1EBFp l\u1ED9 tr\xECnh tu\u1EA7n t\u1EF1 theo ${streetOrder.length} tuy\u1EBFn \u0111\u01B0\u1EDDng & s\u1ED1 nh\xE0 li\xEAn t\u1EE5c!`, "success");
  }
  function healCurrentOrdersGPS() {
    if (currentOrders.length === 0) {
      showToast("Ch\u01B0a c\xF3 \u0111\u01A1n h\xE0ng n\xE0o \u0111\u1EC3 n\u1EAFn s\u1EEDa!", "info");
      return;
    }
    const result = healTripCoordinates(currentOrders);
    StorageService.saveOrders(currentOrders);
    renderApp();
    if (result.healedCount > 0) {
      showToast(`\u26A1 \u0110\xE3 t\u1EF1 \u0111\u1ED9ng n\u1EAFn chu\u1EA9n t\u1ECDa \u0111\u1ED9 cho ${result.healedCount} \u0111\u01A1n h\xE0ng!`, "success");
    } else if (result.outlierCount > 0) {
      showToast(`\u0110\xE3 r\xE0 so\xE1t: C\xF3 ${result.outlierCount} \u0111\u01A1n nghi ng\u1EDD l\u1EC7ch c\u1EA7n ki\u1EC3m tra l\u1EA1i.`, "info");
    } else {
      showToast("\u2713 T\u1EA5t c\u1EA3 \u0111\u01A1n h\xE0ng \u0111\u1EC1u c\xF3 t\u1ECDa \u0111\u1ED9 chu\u1EA9n x\xE1c, kh\xF4ng c\xF3 \u0111\u01A1n l\u1EC7ch!", "success");
    }
  }
  function autoGroupAllOrders() {
    const targetOrders = getActiveTripOrders();
    if (targetOrders.length === 0) {
      showToast("Ch\u01B0a c\xF3 \u0111\u01A1n h\xE0ng n\xE0o \u0111\u1EC3 gom nh\xF3m!", "info");
      return;
    }
    targetOrders.forEach((o) => {
      const cName = extractClusterName(o.address);
      if (cName === "Ch\u01B0a ph\xE2n nh\xF3m") {
        o.groupId = "group_ungrouped";
        return;
      }
      let existing = currentGroups.find((g) => g.id !== "group_ungrouped" && g.name.trim().toLowerCase() === cName.trim().toLowerCase());
      if (!existing) {
        const gId = "grp_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4);
        existing = { id: gId, name: cName, isCollapsed: false };
        currentGroups.push(existing);
      }
      o.groupId = existing.id;
    });
    const usedGroupIds = new Set(currentOrders.map((o) => o.groupId).filter(Boolean));
    currentGroups = currentGroups.filter((g) => g.id === "group_ungrouped" || usedGroupIds.has(g.id));
    StorageService.saveGroups(currentGroups);
    StorageService.saveOrders(currentOrders);
    renderApp();
    showToast(`\u0110\xE3 t\u1EF1 \u0111\u1ED9ng gom nh\xF3m \u0111\u1ECBa ch\u1EC9 cho chuy\u1EBFn hi\u1EC7n t\u1EA1i!`, "success");
  }
  function createNewGroup() {
    const name = prompt("Nh\u1EADp t\xEAn nh\xF3m m\u1EDBi (v\xED d\u1EE5: T\xF2a Centec, Tuy\u1EBFn V\xF5 V\u0103n T\u1EA7n...):");
    if (!name || !name.trim()) return;
    const newId = "grp_" + Date.now();
    currentGroups.push({
      id: newId,
      name: name.trim(),
      isCollapsed: false
    });
    StorageService.saveGroups(currentGroups);
    renderApp();
    showToast(`\u0110\xE3 t\u1EA1o nh\xF3m: ${name.trim()}`, "success");
  }
  function renameGroup(gId) {
    const g = currentGroups.find((item) => item.id === gId);
    if (!g) return;
    const newName = prompt("\u0110\u1ED5i t\xEAn nh\xF3m:", g.name);
    if (!newName || !newName.trim()) return;
    g.name = newName.trim();
    StorageService.saveGroups(currentGroups);
    renderApp();
    showToast(`\u0110\xE3 \u0111\u1ED5i t\xEAn th\xE0nh: ${g.name}`, "success");
  }
  function deleteGroup(gId) {
    if (gId === "group_ungrouped") return;
    const g = currentGroups.find((item) => item.id === gId);
    if (!g) return;
    if (confirm(`X\xE1c nh\u1EADn x\xF3a nh\xF3m "${g.name}"? C\xE1c \u0111\u01A1n s\u1EBD \u0111\u01B0\u1EE3c chuy\u1EC3n v\u1EC1 "Ch\u01B0a ph\xE2n nh\xF3m".`)) {
      currentOrders.forEach((o) => {
        if (o.groupId === gId) o.groupId = "group_ungrouped";
      });
      currentGroups = currentGroups.filter((item) => item.id !== gId);
      StorageService.saveGroups(currentGroups);
      StorageService.saveOrders(currentOrders);
      renderApp();
      showToast(`\u0110\xE3 x\xF3a nh\xF3m: ${g.name}`, "info");
    }
  }
  function toggleGroupCollapse(gId) {
    const g = currentGroups.find((item) => item.id === gId);
    if (g) {
      g.isCollapsed = !g.isCollapsed;
      StorageService.saveGroups(currentGroups);
      renderOrderList();
    }
  }
  function toggleAllCollapse() {
    allCollapsed = !allCollapsed;
    currentGroups.forEach((g) => {
      g.isCollapsed = allCollapsed;
    });
    StorageService.saveGroups(currentGroups);
    renderOrderList();
    if (btnDesktopCollapseAll) {
      btnDesktopCollapseAll.textContent = allCollapsed ? "\u{1F53C} M\u1EDF r\u1ED9ng h\u1EBFt" : "\u{1F53D} Thu g\u1ECDn h\u1EBFt";
    }
    showToast(allCollapsed ? "\u0110\xE3 thu g\u1ECDn t\u1EA5t c\u1EA3 nh\xF3m!" : "\u0110\xE3 m\u1EDF r\u1ED9ng t\u1EA5t c\u1EA3 nh\xF3m!", "info");
  }
  function promptChangeOrderGroup(orderId) {
    const o = currentOrders.find((item) => item.id === orderId);
    if (!o) return;
    const options = currentGroups.map((g, idx) => `${idx + 1}. ${g.name}`).join("\n");
    const choice = prompt(`Ch\u1ECDn nh\xF3m cho \u0111\u01A1n h\xE0ng:
${options}

Nh\u1EADp s\u1ED1 th\u1EE9 t\u1EF1:`);
    if (!choice) return;
    const num = parseInt(choice, 10);
    if (num >= 1 && num <= currentGroups.length) {
      o.groupId = currentGroups[num - 1].id;
      StorageService.saveOrders(currentOrders);
      renderOrderList();
      showToast(`\u0110\xE3 chuy\u1EC3n \u0111\u01A1n v\xE0o nh\xF3m: ${currentGroups[num - 1].name}`, "success");
    }
  }
  var desktopHtml5QrCode = null;
  function setupDesktopQrScanner() {
    const btnScan = document.getElementById("btnDesktopScanQR");
    const modal = document.getElementById("desktopQrModal");
    const btnClose = document.getElementById("btnCloseDesktopQrModal");
    const statusMsg = document.getElementById("desktopQrStatusMsg");
    const fileInput = document.getElementById("desktopQrFileInput");
    if (!btnScan || !modal) return;
    btnScan.addEventListener("click", () => {
      modal.classList.add("show");
      statusMsg.textContent = "\u0110ang kh\u1EDFi \u0111\u1ED9ng camera...";
      if (typeof Html5Qrcode !== "undefined") {
        if (!desktopHtml5QrCode) {
          desktopHtml5QrCode = new Html5Qrcode("desktopQrReader");
        }
        desktopHtml5QrCode.start(
          { facingMode: "environment" },
          {
            fps: 24,
            qrbox: (w, h) => {
              const minEdge = Math.min(w, h);
              const size = Math.floor(minEdge * 0.85);
              return { width: size, height: size };
            }
          },
          onDesktopScanSuccess,
          () => {
          }
        ).then(() => {
          statusMsg.textContent = "\u{1F7E2} Camera s\u1EB5n s\xE0ng! H\u01B0\u1EDBng v\xE0o m\xE3 \u0111\u01A1n h\xE0ng.";
        }).catch((err) => {
          statusMsg.innerHTML = "\u26A0\uFE0F Kh\xF4ng th\u1EC3 m\u1EDF camera (" + (err.message || "Thi\u1EBFu quy\u1EC1n") + "). H\xE3y d\xF9ng n\xFAt <strong>Ch\u1ECDn \u1EA3nh t\u1EEB m\xE1y t\xEDnh</strong>.";
        });
      } else {
        statusMsg.textContent = "Ch\u01B0a t\u1EA3i \u0111\u01B0\u1EE3c th\u01B0 vi\u1EC7n qu\xE9t m\xE3.";
      }
    });
    let desktopSyncMultiPartCache = { sid: null, type: null, pTotal: 1, parts: {} };
    const closeDesktopScanner = () => {
      modal.classList.remove("show");
      if (desktopHtml5QrCode && desktopHtml5QrCode.isScanning) {
        desktopHtml5QrCode.stop().catch(() => {
        });
      }
      desktopSyncMultiPartCache = { sid: null, type: null, pTotal: 1, parts: {} };
    };
    if (btnClose) btnClose.addEventListener("click", closeDesktopScanner);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeDesktopScanner();
    });
    if (fileInput) {
      fileInput.addEventListener("change", (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        statusMsg.textContent = "\u23F3 \u0110ang qu\xE9t \u1EA3nh...";
        if (typeof Html5Qrcode !== "undefined") {
          const scanner = new Html5Qrcode("desktopQrReader");
          scanner.scanFile(file, true).then((decodedText) => {
            onDesktopScanSuccess(decodedText);
          }).catch(() => {
            statusMsg.innerHTML = "\u274C Kh\xF4ng nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c m\xE3 t\u1EEB \u1EA3nh. H\xE3y th\u1EED \u1EA3nh r\xF5 n\xE9t h\u01A1n!";
          });
        }
      });
    }
    function onDesktopScanSuccess(decodedText) {
      if (!decodedText) return;
      const qrsync = window.QRSync || (typeof QRSync !== "undefined" ? QRSync : null);
      if (qrsync && qrsync.isSyncQR(decodedText)) {
        const payload = qrsync.parseQR(decodedText);
        if (payload) {
          const pIndex = payload.pIndex || payload.part || payload.i || 1;
          const pTotal = payload.pTotal || payload.total || payload.n || 1;
          if (pTotal > 1) {
            const sid = payload.sid || "s";
            if (desktopSyncMultiPartCache.sid !== sid || desktopSyncMultiPartCache.pTotal !== pTotal) {
              desktopSyncMultiPartCache = { sid, type: payload.t, pTotal, parts: {} };
            }
            const isNewPart = !desktopSyncMultiPartCache.parts[pIndex];
            desktopSyncMultiPartCache.parts[pIndex] = payload;
            const receivedCount = Object.keys(desktopSyncMultiPartCache.parts).length;
            if (receivedCount < pTotal) {
              if (isNewPart) {
                const missingParts = [];
                for (let mi = 1; mi <= pTotal; mi++) {
                  if (!desktopSyncMultiPartCache.parts[mi]) missingParts.push(mi);
                }
                showToast(`\u{1F7E2} \u0110\xE3 nh\u1EADn ${receivedCount}/${pTotal} ph\u1EA7n! C\xF2n thi\u1EBFu: ${missingParts.join(", ")}`, "info");
                statusMsg.innerHTML = `\u{1F7E2} \u0110\xE3 nh\u1EADn <strong>${receivedCount}/${pTotal} ph\u1EA7n</strong>.<br><span style="color:#f59e0b; font-size:12px; font-weight:700;">\u{1F449} C\xF2n thi\u1EBFu: Ph\u1EA7n ${missingParts.join(", ")}</span>`;
              }
              return;
            }
            closeDesktopScanner();
            if (payload.t === "patch") {
              let allPatches = [];
              let allGroups = [];
              for (let pi = 1; pi <= pTotal; pi++) {
                const part = desktopSyncMultiPartCache.parts[pi];
                if (part) {
                  if (part.g && part.g.length) allGroups = allGroups.concat(part.g);
                  if (part.p && part.p.length) allPatches = allPatches.concat(part.p);
                }
              }
              const res = qrsync.applyPatch({ v: payload.v || 2, g: allGroups, p: allPatches }, currentOrders, currentGroups);
              currentOrders = res.orders;
              currentGroups = res.groups;
              StorageService.saveOrders(currentOrders);
              StorageService.saveGroups(currentGroups);
              renderApp();
              showToast(`\u{1F389} \u0110\xE3 \u0111\u1ED3ng b\u1ED9 t\u1ECDa \u0111\u1ED9 & nh\xF3m cho ${res.matchedCount} \u0111\u01A1n!`, "success");
            } else if (payload.t === "full") {
              let allOrders = [];
              let allGroups = [];
              for (let pi = 1; pi <= pTotal; pi++) {
                const part = desktopSyncMultiPartCache.parts[pi];
                if (part) {
                  if (part.g && part.g.length) allGroups = allGroups.concat(part.g);
                  if (part.o && part.o.length) allOrders = allOrders.concat(part.o);
                }
              }
              const res = qrsync.applyFull({ v: payload.v || 2, g: allGroups, o: allOrders }, currentOrders, currentGroups, false);
              currentOrders = res.orders;
              currentGroups = res.groups;
              ensureGroupIntegrity();
              StorageService.saveOrders(currentOrders);
              StorageService.saveGroups(currentGroups);
              renderApp();
              showToast(`\u{1F389} \u0110\xE3 n\u1EA1p th\xE0nh c\xF4ng ${res.importedCount} \u0111\u01A1n t\u1EEB m\xE3 QR!`, "success");
            }
            desktopSyncMultiPartCache = { sid: null, type: null, pTotal: 1, parts: {} };
            return;
          }
          closeDesktopScanner();
          if (payload.t === "patch") {
            const res = qrsync.applyPatch(payload, currentOrders, currentGroups);
            currentOrders = res.orders;
            currentGroups = res.groups;
            StorageService.saveOrders(currentOrders);
            StorageService.saveGroups(currentGroups);
            renderApp();
            showToast(`\u{1F389} \u0110\xE3 \u0111\u1ED3ng b\u1ED9 t\u1ECDa \u0111\u1ED9 & nh\xF3m cho ${res.matchedCount} \u0111\u01A1n!`, "success");
            return;
          } else if (payload.t === "full") {
            const res = qrsync.applyFull(payload, currentOrders, currentGroups, false);
            currentOrders = res.orders;
            currentGroups = res.groups;
            ensureGroupIntegrity();
            StorageService.saveOrders(currentOrders);
            StorageService.saveGroups(currentGroups);
            renderApp();
            showToast(`\u{1F389} \u0110\xE3 n\u1EA1p th\xE0nh c\xF4ng ${res.importedCount} \u0111\u01A1n t\u1EEB m\xE3 QR!`, "success");
            return;
          }
        }
      }
      const code = extractTrackingCode(decodedText);
      if (!code) return;
      closeDesktopScanner();
      if (searchInput) {
        searchInput.value = code;
        searchQuery = code.toLowerCase().trim();
      }
      const matched = currentOrders.find(
        (o) => (o.trackingCode || "").toLowerCase().includes(searchQuery)
      );
      if (matched && matched.groupId) {
        const g = currentGroups.find((grp) => grp.id === matched.groupId);
        if (g && g.isCollapsed) {
          g.isCollapsed = false;
          StorageService.saveGroups(currentGroups);
        }
      }
      renderApp();
      showToast(`\u{1F3AF} \u0110\xE3 t\xECm th\u1EA5y \u0111\u01A1n: ${code}`, "success");
    }
    function extractTrackingCode(text) {
      if (!text) return "";
      const clean = text.trim();
      const mParam = clean.match(/(?:order_code|ordercode|code|tracking|mvd)=([A-Z0-9]{6,25})/i);
      if (mParam) return mParam[1].toUpperCase();
      const mPath = clean.match(/(?:order-detail|trip-detail|tracking|orders|order|don-hang)\/([A-Z0-9]{6,25})/i);
      if (mPath) return mPath[1].toUpperCase();
      const mCarrier = clean.match(/\b(VNGH[0-9]{8,16}|GY[A-Z0-9]{6,10}|SPX[A-Z0-9]{6,16}|[A-Z]{2}[0-9]{6,14})\b/i);
      if (mCarrier) return mCarrier[0].toUpperCase();
      const mAlphanum = clean.match(/^[A-Z0-9_-]{6,25}$/i);
      if (mAlphanum) return mAlphanum[0].toUpperCase();
      return clean;
    }
  }
  function setupDesktopQrSync() {
    const modal = document.getElementById("desktopQrSyncModal");
    const btnOpen = document.getElementById("btnOpenQrSyncModalDesktop");
    const btnClose = document.getElementById("btnCloseDesktopQrSyncModal");
    const optPatchBox = document.getElementById("desktopOptPatchBox");
    const optFullBox = document.getElementById("desktopOptFullBox");
    const syncModeRadios = document.querySelectorAll('input[name="desktopSyncMode"]');
    const btnDownloadJson = document.getElementById("btnDesktopDownloadJson");
    const importJsonInput = document.getElementById("desktopImportJsonFile");
    const desktopP2PCanvasContainer = document.getElementById("desktopP2PCanvasContainer");
    const desktopP2PHostPinValue = document.getElementById("desktopP2PHostPinValue");
    const desktopP2PHostStatusText = document.getElementById("desktopP2PHostStatusText");
    const syncTripSelect = document.getElementById("desktopSyncTripSelect");
    const tabExport = document.getElementById("tabDesktopExportP2P");
    const tabImport = document.getElementById("tabDesktopImportP2P");
    const hostPanel = document.getElementById("desktopP2PHostPanel");
    const clientPanel = document.getElementById("desktopP2PClientPanel");
    const btnConnectPin = document.getElementById("desktopBtnConnectP2PPin");
    const inputPin = document.getElementById("desktopInputP2PPin");
    const clientStatus = document.getElementById("desktopP2PClientStatusMsg");
    if (!modal || !btnOpen) return;
    let desktopP2PHost = null;
    let currentDesktopSyncMode = "patch";
    function stopDesktopP2PHost() {
      if (desktopP2PHost) {
        try {
          desktopP2PHost.destroy();
        } catch (e) {
        }
        desktopP2PHost = null;
      }
    }
    function startDesktopP2PHost() {
      stopDesktopP2PHost();
      const p2pSync = window.P2PSync || (typeof P2PSync !== "undefined" ? P2PSync : null);
      if (!p2pSync) {
        if (desktopP2PHostStatusText) desktopP2PHostStatusText.innerHTML = "\u26A0\uFE0F Module P2P ch\u01B0a s\u1EB5n s\xE0ng!";
        return;
      }
      if (desktopP2PHostStatusText) {
        desktopP2PHostStatusText.innerHTML = '<span class="pulse-dot"></span> \u23F3 \u0110ang m\u1EDF ph\xF2ng ch\u1EDD Shipper...';
      }
      desktopP2PHost = p2pSync.createHost({
        onReady: (roomInfo) => {
          if (desktopP2PHostPinValue) desktopP2PHostPinValue.textContent = roomInfo.pin;
          if (desktopP2PHostStatusText) {
            desktopP2PHostStatusText.innerHTML = `<span class="pulse-dot"></span> \u23F3 Ph\xF2ng ch\u1EDD: <strong>PIN ${roomInfo.pin}</strong>. \u0110ang \u0111\u1EE3i Shipper...`;
          }
          if (desktopP2PCanvasContainer) {
            p2pSync.renderP2PQR(desktopP2PCanvasContainer, roomInfo.qrToken, { cellSize: 5, margin: 2 });
          }
        },
        onConnecting: () => {
          if (desktopP2PHostStatusText) {
            desktopP2PHostStatusText.innerHTML = '<span class="pulse-dot" style="background:#f59e0b;"></span> \u26A1 Shipper \u0111ang k\u1EBFt n\u1ED1i...';
          }
        },
        onConnected: () => {
          if (desktopP2PHostStatusText) {
            desktopP2PHostStatusText.innerHTML = '<span class="pulse-dot" style="background:#10b981;"></span> \u{1F680} \u0110\xE3 k\u1EBFt n\u1ED1i! \u0110ang b\u1EAFn d\u1EEF li\u1EC7u chuy\u1EBFn...';
          }
          let ordersToSend = currentOrders;
          if (currentDesktopSyncTrip !== "all") {
            ordersToSend = currentOrders.filter((o) => (o.tripCode || "Ch\u01B0a c\xF3 m\xE3 chuy\u1EBFn") === currentDesktopSyncTrip);
          }
          const groupIds = new Set(ordersToSend.map((o) => o.groupId).filter(Boolean));
          const groupsToSend = currentGroups.filter((g) => groupIds.has(g.id));
          let payload;
          if (currentDesktopSyncMode === "patch") {
            payload = p2pSync.buildPatchPayload(ordersToSend, groupsToSend, null);
          } else {
            payload = p2pSync.buildFullPayload(ordersToSend, groupsToSend, null);
          }
          desktopP2PHost.send(payload);
        },
        onSent: () => {
          if (desktopP2PHostStatusText) {
            desktopP2PHostStatusText.innerHTML = '<span style="color:#10b981; font-weight:700;">\u2705 \u0110\xC3 G\u1EECI XONG D\u1EEE LI\u1EC6U CHUY\u1EBEN CHO SHIPPER! (0.05s)</span>';
          }
          showToast("\u26A1 B\u1EAFn d\u1EEF li\u1EC7u chuy\u1EBFn sang \u0110i\u1EC7n tho\u1EA1i th\xE0nh c\xF4ng!", "success");
        },
        onError: (err) => {
          if (desktopP2PHostStatusText) {
            desktopP2PHostStatusText.innerHTML = `<span style="color:#ef4444; font-weight:700;">\u26A0\uFE0F L\u1ED7i P2P: ${err.message || err}</span>`;
          }
        }
      });
    }
    if (syncTripSelect) {
      syncTripSelect.addEventListener("change", (e) => {
        currentDesktopSyncTrip = e.target.value;
        updateSyncTripSummary();
        startDesktopP2PHost();
      });
    }
    if (tabExport && tabImport) {
      tabExport.addEventListener("click", () => {
        tabExport.classList.add("active");
        tabExport.style.background = "#eff6ff";
        tabExport.style.color = "#1d4ed8";
        tabExport.style.borderColor = "#3b82f6";
        tabImport.classList.remove("active");
        tabImport.style.background = "";
        tabImport.style.color = "#64748b";
        tabImport.style.borderColor = "";
        if (hostPanel) hostPanel.style.display = "flex";
        if (clientPanel) clientPanel.style.display = "none";
        startDesktopP2PHost();
      });
      tabImport.addEventListener("click", () => {
        tabImport.classList.add("active");
        tabImport.style.background = "#eff6ff";
        tabImport.style.color = "#1d4ed8";
        tabImport.style.borderColor = "#3b82f6";
        tabExport.classList.remove("active");
        tabExport.style.background = "";
        tabExport.style.color = "#64748b";
        tabExport.style.borderColor = "";
        if (hostPanel) hostPanel.style.display = "none";
        if (clientPanel) clientPanel.style.display = "flex";
        stopDesktopP2PHost();
        if (inputPin) inputPin.focus();
      });
    }
    if (btnConnectPin && inputPin) {
      btnConnectPin.addEventListener("click", () => {
        const pin = inputPin.value.trim();
        if (!pin || pin.length < 6) {
          showToast("Vui l\xF2ng nh\u1EADp \u0111\u1EE7 6 ch\u1EEF s\u1ED1 PIN t\u1EEB \u0111i\u1EC7n tho\u1EA1i!", "error");
          return;
        }
        const p2pSync = window.P2PSync || (typeof P2PSync !== "undefined" ? P2PSync : null);
        if (!p2pSync) return;
        if (clientStatus) {
          clientStatus.innerHTML = `<span class="pulse-dot"></span> \u23F3 \u0110ang k\u1EBFt n\u1ED1i t\u1EDBi \u0111i\u1EC7n tho\u1EA1i qua m\xE3 PIN <strong>${pin}</strong>...`;
        }
        btnConnectPin.disabled = true;
        p2pSync.connectToHost(pin, {
          onConnecting: () => {
            if (clientStatus) clientStatus.innerHTML = `<span class="pulse-dot"></span> \u23F3 \u0110ang b\u1EAFt tay k\u1EBFt n\u1ED1i P2P...`;
          },
          onConnected: () => {
            if (clientStatus) clientStatus.innerHTML = `<span class="pulse-dot" style="background:#10b981;"></span> \u{1F680} \u0110\xE3 k\u1EBFt n\u1ED1i! \u0110ang t\u1EA3i d\u1EEF li\u1EC7u...`;
          },
          onData: (data) => {
            btnConnectPin.disabled = false;
            if (!data || !data.payload) return;
            const p = data.payload;
            if (p.t === "patch") {
              const res = p2pSync.applyPatch(p, currentOrders, currentGroups);
              currentOrders = res.orders;
              currentGroups = res.groups;
              showToast(`\u{1F389} \u0110\xE3 c\u1EADp nh\u1EADt tr\u1EA1ng th\xE1i/t\u1ECDa \u0111\u1ED9 cho ${res.matchedCount} \u0111\u01A1n!`, "success");
            } else if (p.t === "full") {
              const res = p2pSync.applyFull(p, currentOrders, currentGroups, false);
              currentOrders = res.orders;
              currentGroups = res.groups;
              showToast(`\u{1F389} \u0110\xE3 n\u1EA1p th\xE0nh c\xF4ng ${res.importedCount} \u0111\u01A1n t\u1EEB \u0111i\u1EC7n tho\u1EA1i!`, "success");
            }
            ensureGroupIntegrity();
            StorageService.saveOrders(currentOrders);
            StorageService.saveGroups(currentGroups);
            renderApp();
            if (clientStatus) clientStatus.innerHTML = `<span style="color:#10b981; font-weight:700;">\u2705 \u0110\xC3 NH\u1EACN D\u1EEE LI\u1EC6U T\u1EEA \u0110I\u1EC6N THO\u1EA0I TH\xC0NH C\xD4NG!</span>`;
            setTimeout(() => {
              modal.style.display = "none";
            }, 1500);
          },
          onError: (err) => {
            btnConnectPin.disabled = false;
            if (clientStatus) clientStatus.innerHTML = `<span style="color:#ef4444; font-weight:700;">\u274C L\u1ED7i: ${err.message || err}</span>`;
          }
        });
      });
    }
    btnOpen.addEventListener("click", () => {
      modal.style.display = "flex";
      updateSyncTripSummary();
      if (tabExport) tabExport.click();
    });
    if (btnClose) {
      btnClose.addEventListener("click", () => {
        modal.style.display = "none";
        stopDesktopP2PHost();
      });
    }
    window.addEventListener("click", (e) => {
      if (e.target === modal) {
        modal.style.display = "none";
        stopDesktopP2PHost();
      }
    });
    syncModeRadios.forEach((radio) => {
      radio.addEventListener("change", (e) => {
        currentDesktopSyncMode = e.target.value;
        if (currentDesktopSyncMode === "patch") {
          optPatchBox.style.borderColor = "#2563eb";
          optPatchBox.style.background = "#eff6ff";
          optFullBox.style.borderColor = "var(--border-color)";
          optFullBox.style.background = "#f8fafc";
        } else {
          optFullBox.style.borderColor = "#2563eb";
          optFullBox.style.background = "#eff6ff";
          optPatchBox.style.borderColor = "var(--border-color)";
          optPatchBox.style.background = "#f8fafc";
        }
        startDesktopP2PHost();
      });
    });
    if (btnDownloadJson) {
      btnDownloadJson.addEventListener("click", () => {
        const p2pSync = window.P2PSync || (typeof P2PSync !== "undefined" ? P2PSync : null);
        if (!p2pSync) return;
        const jsonStr = p2pSync.exportToFileData(currentOrders, currentGroups, null);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const now = /* @__PURE__ */ new Date();
        const dateStr = now.getFullYear() + ("0" + (now.getMonth() + 1)).slice(-2) + ("0" + now.getDate()).slice(-2) + "_" + ("0" + now.getHours()).slice(-2) + ("0" + now.getMinutes()).slice(-2);
        const fileName = `GHN_Backup_${dateStr}.json`;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
        showToast(`\u0110\xE3 t\u1EA3i file sao l\u01B0u: ${fileName}`, "success");
      });
    }
    if (importJsonInput) {
      importJsonInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          try {
            const data = JSON.parse(evt.target.result);
            if (!data || !data.orders && !data.groups) {
              showToast("File kh\xF4ng \u0111\xFAng \u0111\u1ECBnh d\u1EA1ng sao l\u01B0u GHN!", "error");
              return;
            }
            if (Array.isArray(data.orders)) currentOrders = data.orders;
            if (Array.isArray(data.groups)) currentGroups = data.groups;
            ensureGroupIntegrity();
            StorageService.saveOrders(currentOrders);
            StorageService.saveGroups(currentGroups);
            renderApp();
            modal.style.display = "none";
            stopDesktopP2PHost();
            showToast(`\u0110\xE3 n\u1EA1p th\xE0nh c\xF4ng ${currentOrders.length} \u0111\u01A1n v\xE0 ${currentGroups.length} nh\xF3m!`, "success");
          } catch (err) {
            showToast(`L\u1ED7i \u0111\u1ECDc file JSON: ${err.message}`, "error");
          }
        };
        reader.readAsText(file);
        e.target.value = "";
      });
    }
  }
  function setupDesktopTripFilter() {
    const tripFilterEl = document.getElementById("desktopTripFilter");
    if (tripFilterEl) {
      tripFilterEl.addEventListener("change", (e) => {
        activeTripFilter = e.target.value;
        renderApp();
        const label = e.target.options[e.target.selectedIndex].text;
        showToast(`\u0110\xE3 l\u1ECDc: ${label}`, "info");
      });
    }
  }
  function updateDesktopTripFilterOptions() {
    const tripFilterEl = document.getElementById("desktopTripFilter");
    const syncTripSelectEl = document.getElementById("desktopSyncTripSelect");
    const tripCounts = {};
    currentOrders.forEach((o) => {
      const tc = o.tripCode || "Ch\u01B0a c\xF3 m\xE3 chuy\u1EBFn";
      tripCounts[tc] = (tripCounts[tc] || 0) + 1;
    });
    const tripKeys = Object.keys(tripCounts).sort();
    if (tripFilterEl) {
      const currentVal = tripFilterEl.value || activeTripFilter;
      let html = `<option value="all">\u{1F4E6} T\u1EA5t c\u1EA3 chuy\u1EBFn (${currentOrders.length} \u0111\u01A1n)</option>`;
      tripKeys.forEach((k) => {
        html += `<option value="${escapeHtml(k)}">\u26A1 Chuy\u1EBFn ${escapeHtml(k)} (${tripCounts[k]} \u0111\u01A1n)</option>`;
      });
      tripFilterEl.innerHTML = html;
      if (tripKeys.includes(currentVal) || currentVal === "all") {
        tripFilterEl.value = currentVal;
        activeTripFilter = currentVal;
      } else {
        tripFilterEl.value = "all";
        activeTripFilter = "all";
      }
    }
    if (syncTripSelectEl) {
      const currentSyncVal = syncTripSelectEl.value || currentDesktopSyncTrip;
      let html = `<option value="all">\u{1F4E6} To\xE0n b\u1ED9 \u0111\u01A1n h\xE0ng (${currentOrders.length} \u0111\u01A1n)</option>`;
      tripKeys.forEach((k) => {
        html += `<option value="${escapeHtml(k)}">\u26A1 Chuy\u1EBFn ${escapeHtml(k)} (${tripCounts[k]} \u0111\u01A1n)</option>`;
      });
      syncTripSelectEl.innerHTML = html;
      if (tripKeys.includes(currentSyncVal) || currentSyncVal === "all") {
        syncTripSelectEl.value = currentSyncVal;
        currentDesktopSyncTrip = currentSyncVal;
      } else {
        syncTripSelectEl.value = "all";
        currentDesktopSyncTrip = "all";
      }
      updateSyncTripSummary();
    }
  }
  function updateSyncTripSummary() {
    const summaryEl = document.getElementById("desktopSyncTripSummary");
    if (!summaryEl) return;
    if (currentDesktopSyncTrip === "all") {
      summaryEl.textContent = `\u0110ang ch\u1ECDn xu\u1EA5t: To\xE0n b\u1ED9 ${currentOrders.length} \u0111\u01A1n h\xE0ng`;
    } else {
      const count = currentOrders.filter((o) => (o.tripCode || "Ch\u01B0a c\xF3 m\xE3 chuy\u1EBFn") === currentDesktopSyncTrip).length;
      summaryEl.textContent = `\u0110ang ch\u1ECDn xu\u1EA5t: ${count} \u0111\u01A1n c\u1EE7a chuy\u1EBFn ${currentDesktopSyncTrip}`;
    }
  }
  function getActiveTripOrders() {
    if (activeTripFilter === "all") {
      return currentOrders;
    }
    return currentOrders.filter((o) => (o.tripCode || "Ch\u01B0a c\xF3 m\xE3 chuy\u1EBFn") === activeTripFilter);
  }
  function renderApp() {
    updateDesktopTripFilterOptions();
    renderStats();
    renderOrderList();
    renderDesktopMap();
  }
  function renderStats() {
    const activeOrders = getActiveTripOrders();
    const total = activeOrders.length;
    const pending = activeOrders.filter((o) => o.status === "pending").length;
    const gtc = activeOrders.filter((o) => o.status === "gtc").length;
    const gtb = activeOrders.filter((o) => o.status === "gtb").length;
    const totalCod = activeOrders.reduce((sum, o) => sum + (o.codAmount || 0), 0);
    const validGps = activeOrders.filter((o) => isValidCoordinate(o.lat, o.lng)).length;
    if (statTotal) statTotal.textContent = total;
    if (statPending) statPending.textContent = pending;
    if (statGtc) statGtc.textContent = gtc;
    if (statGtb) statGtb.textContent = gtb;
    if (statCod) statCod.textContent = formatCurrency(totalCod);
    const desktopMapBadge = document.getElementById("desktopMapBadge");
    if (desktopMapBadge) desktopMapBadge.textContent = validGps;
  }
  function isValidCoordinate(lat, lng) {
    if (lat == null || lng == null) return false;
    const nLat = Number(lat);
    const nLng = Number(lng);
    return !isNaN(nLat) && !isNaN(nLng) && nLat > 8 && nLat < 24 && nLng > 102 && nLng < 110;
  }
  function createDesktopMarkerIcon(stt, status, isSelected, clusterCount) {
    const isCluster = clusterCount && clusterCount > 1;
    const badgeHtml = isCluster ? `<span class="ghn-cluster-badge">${clusterCount}</span>` : "";
    return L.divIcon({
      className: "ghn-div-icon",
      html: `<div class="ghn-map-pin${isCluster ? " ghn-cluster-pin" : ""} status-${status}${isSelected ? " active" : ""}">
            <div class="ghn-map-pin-inner">
              <span>#${stt}</span>
            </div>
            ${badgeHtml}
          </div>`,
      iconSize: [32, 38],
      iconAnchor: [16, 38],
      popupAnchor: [0, -36]
    });
  }
  function setupDesktopViewSwitcher() {
    const btnList = document.getElementById("btnDesktopViewList");
    const btnMap = document.getElementById("btnDesktopViewMap");
    if (btnList) {
      btnList.addEventListener("click", () => switchDesktopView("list"));
    }
    if (btnMap) {
      btnMap.addEventListener("click", () => switchDesktopView("map"));
    }
  }
  function switchDesktopView(mode) {
    desktopCurrentView = mode;
    const btnList = document.getElementById("btnDesktopViewList");
    const btnMap = document.getElementById("btnDesktopViewMap");
    const ordersListEl2 = document.getElementById("ordersList");
    const groupBar = document.getElementById("desktopGroupBar");
    const mapContainer = document.getElementById("desktopMapContainer");
    const emptyStateEl2 = document.getElementById("emptyState");
    if (mode === "list") {
      if (btnList) btnList.classList.add("active");
      if (btnMap) btnMap.classList.remove("active");
      if (ordersListEl2) ordersListEl2.style.display = "flex";
      if (groupBar) groupBar.style.display = "flex";
      if (mapContainer) mapContainer.style.display = "none";
      if (currentOrders.length === 0 && emptyStateEl2) emptyStateEl2.style.display = "block";
    } else {
      if (btnList) btnList.classList.remove("active");
      if (btnMap) btnMap.classList.add("active");
      if (ordersListEl2) ordersListEl2.style.display = "none";
      if (groupBar) groupBar.style.display = "none";
      if (emptyStateEl2) emptyStateEl2.style.display = "none";
      if (mapContainer) mapContainer.style.display = "flex";
      if (!desktopMap) {
        initDesktopMap();
      }
      setTimeout(() => {
        if (desktopMap) {
          desktopMap.invalidateSize();
          renderDesktopMap();
        }
      }, 150);
    }
  }
  function initDesktopMap() {
    if (desktopMap) return;
    const mapEl = document.getElementById("desktopDeliveryMap");
    if (!mapEl || typeof L === "undefined") return;
    desktopMap = L.map("desktopDeliveryMap", {
      center: [10.7769, 106.7009],
      zoom: 14,
      zoomControl: false,
      attributionControl: false
    });
    L.control.zoom({ position: "bottomright" }).addTo(desktopMap);
    desktopActiveTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      subdomains: ["a", "b", "c"]
    }).addTo(desktopMap);
    setupDesktopMapControls();
  }
  function setupDesktopMapControls() {
    const btnLocate = document.getElementById("btnDesktopMapLocate");
    if (btnLocate) {
      btnLocate.addEventListener("click", () => {
        if (!navigator.geolocation) {
          showToast("Tr\xECnh duy\u1EC7t kh\xF4ng h\u1ED7 tr\u1EE3 \u0111\u1ECBnh v\u1ECB GPS", "error");
          return;
        }
        showToast("\u0110ang t\xECm v\u1ECB tr\xED GPS c\u1EE7a b\u1EA1n...", "info");
        navigator.geolocation.getCurrentPosition((pos) => {
          const uLat = pos.coords.latitude;
          const uLng = pos.coords.longitude;
          updateDesktopUserMarker(uLat, uLng, pos.coords.accuracy);
          desktopMap.flyTo([uLat, uLng], 16, { duration: 1.2 });
          showToast("\u0110\xE3 \u0111\u1ECBnh v\u1ECB v\u1ECB tr\xED hi\u1EC7n t\u1EA1i c\u1EE7a b\u1EA1n", "success");
        }, (err) => {
          showToast("L\u1ED7i GPS: " + (err.message || "Kh\xF4ng th\u1EC3 x\xE1c \u0111\u1ECBnh v\u1ECB tr\xED"), "error");
        }, { enableHighAccuracy: true, timeout: 1e4 });
      });
    }
    const btnPoly = document.getElementById("btnDesktopMapPolyline");
    if (btnPoly) {
      btnPoly.addEventListener("click", () => {
        isDesktopPolylineVisible = !isDesktopPolylineVisible;
        btnPoly.classList.toggle("active", isDesktopPolylineVisible);
        renderDesktopMap();
        showToast(isDesktopPolylineVisible ? "\u0110\xE3 b\u1EADt \u0111\u01B0\u1EDDng n\u1ED1i l\u1ED9 tr\xECnh" : "\u0110\xE3 \u1EA9n \u0111\u01B0\u1EDDng n\u1ED1i l\u1ED9 tr\xECnh", "info");
      });
    }
    const btnFit = document.getElementById("btnDesktopMapFit");
    if (btnFit) {
      btnFit.addEventListener("click", () => {
        const bounds = L.latLngBounds();
        let count = 0;
        currentOrders.forEach((o) => {
          if (isValidCoordinate(o.lat, o.lng)) {
            bounds.extend([Number(o.lat), Number(o.lng)]);
            count++;
          }
        });
        if (count > 0 && bounds.isValid() && desktopMap) {
          desktopMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
          showToast(`\u0110\xE3 thu ph\xF3ng v\u1EEBa ${count} \u0111i\u1EC3m giao`, "success");
        } else {
          showToast("Ch\u01B0a c\xF3 \u0111\u01A1n n\xE0o c\xF3 t\u1ECDa \u0111\u1ED9 GPS", "info");
        }
      });
    }
    const btnLayer = document.getElementById("btnDesktopMapLayer");
    if (btnLayer) {
      btnLayer.addEventListener("click", () => {
        if (!desktopMap) return;
        if (desktopMapTileMode === "osm") {
          desktopMapTileMode = "satellite";
          desktopMap.removeLayer(desktopActiveTileLayer);
          desktopActiveTileLayer = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
            maxZoom: 19
          }).addTo(desktopMap);
          btnLayer.classList.add("active");
          btnLayer.textContent = "\u{1F5FA}\uFE0F \u0110\u01B0\u1EDDng ph\u1ED1";
          showToast("\u0110\xE3 chuy\u1EC3n sang B\u1EA3n \u0111\u1ED3 V\u1EC7 tinh", "info");
        } else {
          desktopMapTileMode = "osm";
          desktopMap.removeLayer(desktopActiveTileLayer);
          desktopActiveTileLayer = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            subdomains: ["a", "b", "c"]
          }).addTo(desktopMap);
          btnLayer.classList.remove("active");
          btnLayer.textContent = "\u{1F5FA}\uFE0F V\u1EC7 tinh";
          showToast("\u0110\xE3 chuy\u1EC3n sang B\u1EA3n \u0111\u1ED3 \u0110\u01B0\u1EDDng ph\u1ED1", "info");
        }
      });
    }
  }
  function updateDesktopUserMarker(lat, lng, accuracy) {
    if (!desktopMap) return;
    const pos = [lat, lng];
    if (!desktopUserMarker) {
      const icon = L.divIcon({
        className: "shipper-gps-div-icon",
        html: '<div class="shipper-gps-marker"><div class="shipper-gps-pulse"></div><div class="shipper-gps-dot"></div></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      desktopUserMarker = L.marker(pos, { icon, zIndexOffset: 2e3 }).addTo(desktopMap);
      desktopUserAccuracy = L.circle(pos, {
        radius: Math.max(accuracy || 20, 15),
        color: "#2563eb",
        fillColor: "#3b82f6",
        fillOpacity: 0.12,
        weight: 1.5
      }).addTo(desktopMap);
    } else {
      desktopUserMarker.setLatLng(pos);
      if (desktopUserAccuracy) {
        desktopUserAccuracy.setLatLng(pos);
        desktopUserAccuracy.setRadius(Math.max(accuracy || 20, 15));
      }
    }
  }
  function clusterDesktopOrdersByLocation(mappedList) {
    const clusters = [];
    const threshold = 22e-5;
    for (let i = 0; i < mappedList.length; i++) {
      const m = mappedList[i];
      let matched = null;
      const fp = m.item.locationFingerprint;
      if (fp && !fp.startsWith("street_") && !fp.startsWith("raw_")) {
        for (let j = 0; j < clusters.length; j++) {
          if (clusters[j].locationFingerprint === fp) {
            matched = clusters[j];
            break;
          }
        }
      }
      if (!matched) {
        for (let j = 0; j < clusters.length; j++) {
          const c = clusters[j];
          if (Math.hypot(m.lat - c.lat, m.lng - c.lng) <= threshold) {
            matched = c;
            break;
          }
        }
      }
      if (matched) {
        matched.orders.push(m);
      } else {
        clusters.push({
          id: "d_cluster_" + m.item.id,
          locationFingerprint: fp,
          lat: m.lat,
          lng: m.lng,
          orders: [m]
        });
      }
    }
    clusters.forEach((c) => {
      c.count = c.orders.length;
      const allGtc = c.orders.every((o) => o.item.status === "gtc");
      const allGtb = c.orders.every((o) => o.item.status === "gtb");
      c.primaryStatus = allGtc ? "gtc" : allGtb ? "gtb" : "pending";
      c.primaryStt = c.orders[0].stt;
    });
    return clusters;
  }
  function renderDesktopMap() {
    if (!desktopMap) {
      if (desktopCurrentView === "map") initDesktopMap();
      if (!desktopMap) return;
    }
    const activeOrders = getActiveTripOrders();
    const mapped = [];
    activeOrders.forEach((item, idx) => {
      if (isValidCoordinate(item.lat, item.lng)) {
        mapped.push({ item, stt: idx + 1, lat: Number(item.lat), lng: Number(item.lng) });
      }
    });
    const unmapped = activeOrders.filter((item) => !isValidCoordinate(item.lat, item.lng));
    const unmappedChip = document.getElementById("dMapUnmappedChip");
    const unmappedCountEl = document.getElementById("dMapUnmappedCount");
    if (unmappedChip && unmappedCountEl) {
      unmappedCountEl.textContent = unmapped.length;
      unmappedChip.style.display = unmapped.length > 0 ? "inline-flex" : "none";
    }
    const dPoints = document.getElementById("dMapPoints");
    const dPending = document.getElementById("dMapPending");
    const dGtc = document.getElementById("dMapGtc");
    if (dPoints) dPoints.textContent = mapped.length;
    if (dPending) dPending.textContent = mapped.filter((m) => m.item.status === "pending").length;
    if (dGtc) dGtc.textContent = mapped.filter((m) => m.item.status === "gtc").length;
    const clusters = clusterDesktopOrdersByLocation(mapped);
    const currentClusterIds = new Set(clusters.map((c) => c.id));
    for (const id in desktopMapMarkers) {
      if (!currentClusterIds.has(id)) {
        desktopMap.removeLayer(desktopMapMarkers[id]);
        delete desktopMapMarkers[id];
      }
    }
    const latlngs = [];
    const bounds = L.latLngBounds();
    clusters.forEach((cluster) => {
      const pos = [cluster.lat, cluster.lng];
      latlngs.push(pos);
      bounds.extend(pos);
      const isSelected = selectedDesktopOrderId && cluster.orders.some((o) => o.item.id === selectedDesktopOrderId);
      const icon = createDesktopMarkerIcon(cluster.primaryStt, cluster.primaryStatus, isSelected, cluster.count);
      let popupContent = "";
      if (cluster.count > 1) {
        popupContent = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 260px; max-height: 280px; overflow-y: auto; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 2px solid #f26522; padding-bottom: 4px;">
            <strong style="color: #0f172a;">\u{1F3E2} ${cluster.count} \u0111\u01A1n t\u1EA1i v\u1ECB tr\xED n\xE0y</strong>
            <span style="font-size: 11px; background: #eff6ff; color: #1d4ed8; font-weight: 700; padding: 1px 6px; border-radius: 4px;">C\u1EE5m</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 6px;">
            ${cluster.orders.map((o) => `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2px;">
                  <strong style="color: #001f3f;">#${o.stt} ${escapeHtml(o.item.customerName || "Kh\xE1ch l\u1EBB")}</strong>
                  <span style="font-size: 10.5px; font-weight: 700; color: ${o.item.status === "gtc" ? o.item.subStatus === "cho_ck" ? "#d97706" : "#15803d" : o.item.status === "gtb" ? "#dc2626" : "#d97706"};">
                    ${o.item.status === "gtc" ? o.item.subStatus === "cho_ck" ? "\u{1F7E1} Ch\u1EDD CK" : "\u2713 GTC" : o.item.status === "gtb" ? "\u2715 GTB" : "\u23F3 Ch\u1EDD"}
                  </span>
                </div>
                <div style="font-size: 11.5px; color: #475569; margin-bottom: 2px;">${escapeHtml(o.item.address)}</div>
                <div style="font-size: 11.5px; display: flex; justify-content: space-between; align-items: center;">
                  <span>COD: <strong style="color: #f26522;">${formatCurrency(o.item.codAmount)}</strong></span>
                  ${o.item.phone ? `<a href="tel:${o.item.phone}" style="color: #0284c7; text-decoration: none; font-weight: 700;">\u{1F4DE} G\u1ECDi</a>` : ""}
                </div>
              </div>
            `).join("")}
          </div>
          <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 4px; text-align: center;">
            <button type="button" class="btn-desktop-edit-loc" style="width: 100%; font-size: 11.5px; padding: 5px 8px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer; font-weight: 700;" onclick="window.openDesktopUpdateLocModalById('${cluster.orders[0].item.id}', ${cluster.primaryStt})">
              \u{1F4CD} S\u1EEDa v\u1ECB tr\xED cho c\u1EE5m ${cluster.count} \u0111\u01A1n
            </button>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${cluster.lat},${cluster.lng}" target="_blank" style="background: #f0fdf4; color: #15803d; padding: 5px 10px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11.5px; display: inline-block;">
              \u{1F9ED} Ch\u1EC9 \u0111\u01B0\u1EDDng \u0111\u1EBFn t\xF2a nh\xE0 n\xE0y
            </a>
          </div>
        </div>
      `;
      } else {
        const o = cluster.orders[0];
        const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
        let statusText = "\u23F3 Ch\u1EDD giao h\xE0ng";
        let statusColor = "#d97706";
        if (o.item.status === "gtc") {
          if (o.item.subStatus === "cho_ck") {
            statusText = "\u{1F7E1} Ch\u1EDD CK";
            statusColor = "#d97706";
          } else {
            statusText = "\u2713 Giao th\xE0nh c\xF4ng (GTC)";
            statusColor = "#15803d";
          }
        } else if (o.item.status === "gtb") {
          const reason = o.item.gtbReason || (o.item.subStatus === "hen_giao_lai" ? "H\u1EB9n giao l\u1EA1i" : o.item.subStatus === "knm" ? "KNM" : o.item.subStatus === "tu_choi" ? "T\u1EEB ch\u1ED1i nh\u1EADn" : "");
          statusText = reason ? `\u2715 GTB (${reason})` : "\u2715 Giao th\u1EA5t b\u1EA1i (GTB)";
          statusColor = "#dc2626";
        }
        popupContent = `
        <div style="font-family: inherit; font-size: 13px; line-height: 1.4; min-width: 220px; padding: 2px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px;">
            <strong style="background: #001f3f; color: #fff; padding: 2px 7px; border-radius: 4px; font-size: 12px;">#${o.stt}</strong>
            <span style="font-size: 11px; font-weight: 700; color: ${statusColor};">${statusText}</span>
          </div>
          <div style="font-weight: 800; font-size: 14px; color: #0f172a; margin-bottom: 3px;">${escapeHtml(o.item.customerName || "Kh\xE1ch l\u1EBB")}</div>
          <div style="font-size: 11.5px; color: #64748b; margin-bottom: 4px;">M\xE3: <code style="color: #2563eb;">${escapeHtml(o.item.trackingCode)}</code></div>
          <div style="font-size: 12px; color: #334155; margin-bottom: 6px;">\u{1F4CD} ${escapeHtml(o.item.address)}</div>
          <div style="background: #f8fafc; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; font-size: 12px;">
            Thu COD: <strong style="color: #f26522;">${formatCurrency(o.item.codAmount)}</strong>
            ${o.item.gtbThu ? `<br>GTB thu: <strong style="color: #dc2626;">${formatCurrency(o.item.gtbThu)}</strong>` : ""}
          </div>
          <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px;">
            ${o.item.phone ? `<a href="tel:${o.item.phone}" style="background: #e0f2fe; color: #0369a1; padding: 5px 8px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11px;">\u{1F4DE} G\u1ECDi ${o.item.phone}</a>` : ""}
            <a href="${gmapsUrl}" target="_blank" style="background: #f0fdf4; color: #15803d; padding: 5px 8px; border-radius: 4px; text-decoration: none; font-weight: 700; font-size: 11px;">\u{1F9ED} D\u1EABn \u0111\u01B0\u1EDDng</a>
          </div>
          <button type="button" class="btn-desktop-edit-loc" style="width: 100%; font-size: 11.5px; padding: 5px 8px; background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe; border-radius: 4px; cursor: pointer; font-weight: 700;" onclick="window.openDesktopUpdateLocModalById('${o.item.id}', ${o.stt})">
            \u{1F4CD} S\u1EEDa v\u1ECB tr\xED / Ch\u1ECDn tr\xEAn b\u1EA3n \u0111\u1ED3
          </button>
        </div>
      `;
      }
      if (desktopMapMarkers[cluster.id]) {
        desktopMapMarkers[cluster.id].setLatLng(pos);
        desktopMapMarkers[cluster.id].setIcon(icon);
        desktopMapMarkers[cluster.id].setPopupContent(popupContent);
      } else {
        const marker = L.marker(pos, { icon, draggable: true });
        marker.bindPopup(popupContent, { maxWidth: 320 });
        marker.on("dragend", (e) => {
          const newLatLng = e.target.getLatLng();
          const nLat = Number(newLatLng.lat.toFixed(6));
          const nLng = Number(newLatLng.lng.toFixed(6));
          cluster.orders.forEach((o) => {
            o.item.lat = nLat;
            o.item.lng = nLng;
            o.item.isGpsHealed = true;
            o.item.isGpsOutlier = false;
          });
          StorageService.saveOrders(currentOrders);
          showToast(`\u{1F4CD} \u0110\xE3 d\u1EDDi ${cluster.count > 1 ? cluster.count + " \u0111\u01A1n" : "\u0111\u01A1n #" + cluster.primaryStt} \u0111\u1EBFn [${nLat}, ${nLng}]`, "success");
          renderApp();
        });
        marker.addTo(desktopMap);
        desktopMapMarkers[cluster.id] = marker;
      }
    });
    if (desktopRoutePolyline) {
      desktopMap.removeLayer(desktopRoutePolyline);
      desktopRoutePolyline = null;
    }
    if (isDesktopPolylineVisible && latlngs.length >= 2) {
      desktopRoutePolyline = L.polyline(latlngs, {
        color: "#f26522",
        weight: 3.5,
        opacity: 0.82,
        dashArray: "7, 9",
        lineJoin: "round"
      }).addTo(desktopMap);
    }
    if (mapped.length > 0 && bounds.isValid() && !selectedDesktopOrderId) {
      desktopMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
    }
  }
  function jumpToDesktopMapOrder(orderId) {
    switchDesktopView("map");
    setTimeout(() => {
      const item = currentOrders.find((o) => o.id === orderId);
      if (!item) return;
      if (isValidCoordinate(item.lat, item.lng)) {
        selectedDesktopOrderId = orderId;
        renderDesktopMap();
        if (desktopMap) {
          desktopMap.flyTo([Number(item.lat), Number(item.lng)], 16, { duration: 0.8 });
          const mapped = [];
          currentOrders.forEach((it, idx) => {
            if (isValidCoordinate(it.lat, it.lng)) {
              mapped.push({ item: it, stt: idx + 1, lat: Number(it.lat), lng: Number(it.lng) });
            }
          });
          const clusters = clusterDesktopOrdersByLocation(mapped);
          const targetCluster = clusters.find((c) => c.orders.some((o) => o.item.id === orderId));
          if (targetCluster && desktopMapMarkers[targetCluster.id]) {
            desktopMapMarkers[targetCluster.id].openPopup();
          }
        }
      } else {
        showToast("\u0110\u01A1n n\xE0y ch\u01B0a c\xF3 t\u1ECDa \u0111\u1ED9 GPS \u0111\u1EC3 hi\u1EC3n th\u1ECB tr\xEAn b\u1EA3n \u0111\u1ED3", "info");
      }
    }, 180);
  }
  function renderOrderList() {
    ordersListEl.innerHTML = "";
    const activeOrders = getActiveTripOrders();
    let filtered = activeOrders.filter((order) => {
      if (activeFilter !== "all" && order.status !== activeFilter) return false;
      if (searchQuery) {
        const g = currentGroups.find((item) => item.id === order.groupId);
        const gName = g ? g.name.toLowerCase() : "";
        const matchTracking = (order.trackingCode || "").toLowerCase().includes(searchQuery);
        const matchName = (order.customerName || "").toLowerCase().includes(searchQuery);
        const matchPhone = (order.phone || "").toLowerCase().includes(searchQuery);
        const matchAddress = (order.address || "").toLowerCase().includes(searchQuery);
        const matchNotes = (order.notes || "").toLowerCase().includes(searchQuery);
        return matchTracking || matchName || matchPhone || matchAddress || matchNotes || gName.includes(searchQuery);
      }
      return true;
    });
    if (filtered.length === 0) {
      emptyStateEl.style.display = "block";
      return;
    }
    emptyStateEl.style.display = "none";
    currentGroups.forEach((group) => {
      const ordersInGroup = filtered.filter((o) => (o.groupId || "group_ungrouped") === group.id);
      if (ordersInGroup.length === 0) {
        return;
      }
      const gTotalCod = ordersInGroup.reduce((sum, o) => sum + (o.codAmount || 0), 0);
      const gPending = ordersInGroup.filter((o) => o.status === "pending").length;
      const gGtc = ordersInGroup.filter((o) => o.status === "gtc").length;
      const gGtb = ordersInGroup.filter((o) => o.status === "gtb").length;
      const groupWrapper = document.createElement("div");
      groupWrapper.className = `group-wrapper ${group.isCollapsed ? "collapsed" : ""}`;
      const headerEl = document.createElement("div");
      headerEl.className = "group-header";
      headerEl.innerHTML = `
      <div class="group-header-info">
        <span class="group-arrow">${group.isCollapsed ? "\u25B6" : "\u25BC"}</span>
        <span>\u{1F4C1} ${escapeHtml(group.name)}</span>
        <span class="group-count-tag">${ordersInGroup.length} \u0111\u01A1n</span>
        <span class="group-cod-tag">${formatCurrency(gTotalCod)}</span>
      </div>
      <div class="group-header-stats">
        <span class="group-stat-mini pending">${gPending} ch\u1EDD</span>
        <span class="group-stat-mini gtc">${gGtc} GTC</span>
        <span class="group-stat-mini gtb">${gGtb} GTB</span>
        ${group.id !== "group_ungrouped" ? `
          <button class="group-btn-tool btn-rename-grp" title="\u0110\u1ED5i t\xEAn nh\xF3m">\u270F\uFE0F</button>
          <button class="group-btn-tool btn-del-grp" title="X\xF3a nh\xF3m">\u{1F5D1}</button>
        ` : ""}
      </div>
    `;
      headerEl.addEventListener("click", (e) => {
        if (e.target.closest(".group-btn-tool")) return;
        toggleGroupCollapse(group.id);
      });
      const btnRen = headerEl.querySelector(".btn-rename-grp");
      if (btnRen) {
        btnRen.addEventListener("click", (e) => {
          e.stopPropagation();
          renameGroup(group.id);
        });
      }
      const btnDel = headerEl.querySelector(".btn-del-grp");
      if (btnDel) {
        btnDel.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteGroup(group.id);
        });
      }
      groupWrapper.appendChild(headerEl);
      if (!group.isCollapsed) {
        const itemsContainer = document.createElement("div");
        itemsContainer.className = "group-items-container";
        ordersInGroup.forEach((order) => {
          const routeNumber = activeOrders.findIndex((o) => o.id === order.id) + 1;
          const cardEl = createOrderCard(order, routeNumber, activeOrders, group.name);
          itemsContainer.appendChild(cardEl);
        });
        groupWrapper.appendChild(itemsContainer);
      }
      ordersListEl.appendChild(groupWrapper);
    });
  }
  function createOrderCard(order, routeNumber, activeOrders, groupName) {
    const card = document.createElement("div");
    card.className = `order-card status-${order.status}${order.subStatus === "cho_ck" ? " status-cho-ck" : ""}`;
    card.setAttribute("data-id", order.id);
    card.draggable = true;
    let statusText = "Ch\u1EDD giao";
    let statusClass = "pending";
    if (order.status === "gtc") {
      if (order.subStatus === "cho_ck") {
        statusText = "Ch\u1EDD CK \u{1F7E1}";
        statusClass = "cho-ck";
      } else {
        statusText = "GTC (Th\xE0nh c\xF4ng)";
        statusClass = "gtc";
      }
    } else if (order.status === "gtb") {
      const reason = order.gtbReason || (order.subStatus === "hen_giao_lai" ? "H\u1EB9n giao l\u1EA1i" : order.subStatus === "knm" ? "KNM" : order.subStatus === "tu_choi" ? "T\u1EEB ch\u1ED1i nh\u1EADn" : "");
      statusText = reason ? `GTB (${reason})` : "GTB (Th\u1EA5t b\u1EA1i)";
      statusClass = "gtb";
    }
    const hasGps = isValidCoordinate(order.lat, order.lng);
    const isMissingNum = order.hasHouseNumber === false;
    const isHealed = !!order.isGpsHealed;
    const isOutlier = !!order.isGpsOutlier;
    const secPhone = order.secondaryPhone && order.secondaryPhone !== order.phone ? order.secondaryPhone : null;
    const mapsUrl = hasGps ? `https://www.google.com/maps/dir/?api=1&destination=${order.lat},${order.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.address || "")}`;
    card.innerHTML = `
    <!-- C\u1ED9t s\u1EAFp x\u1EBFp & Drag Handle -->
    <div class="order-reorder-col">
      <div class="drag-handle" title="K\xE9o \u0111\u1EC3 \u0111\u1ED5i th\u1EE9 t\u1EF1 l\u1ED9 tr\xECnh">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="5" r="1"></circle>
          <circle cx="9" cy="12" r="1"></circle>
          <circle cx="9" cy="19" r="1"></circle>
          <circle cx="15" cy="5" r="1"></circle>
          <circle cx="15" cy="12" r="1"></circle>
          <circle cx="15" cy="19" r="1"></circle>
        </svg>
      </div>
      <span class="route-badge" title="Th\u1EE9 t\u1EF1 giao h\xE0ng">#${routeNumber}</span>
      <div class="move-buttons">
        <button class="btn-move btn-move-up" title="Di chuy\u1EC3n l\xEAn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </button>
        <button class="btn-move btn-move-down" title="Di chuy\u1EC3n xu\u1ED1ng">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <!-- Th\xF4ng tin chi ti\u1EBFt \u0111\u01A1n h\xE0ng -->
    <div class="order-info">
      <div class="order-row-header">
        <span class="tracking-code" title="B\u1EA5m \u0111\u1EC3 sao ch\xE9p m\xE3 v\u1EADn \u0111\u01A1n">
          ${escapeHtml(order.trackingCode || "CH\u01AFA C\xD3 M\xC3")}
          <svg class="copy-hint-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
        </span>
        <span class="status-badge ${statusClass}">${statusText}</span>
        ${order.deliveryPhoto ? `<a href="${order.deliveryPhoto}" target="_blank" class="badge-geo-alert" style="background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; text-decoration:none;" title="Xem \u1EA3nh ch\u1EE5p khi giao">\u{1F4F8} C\xF3 \u1EA3nh</a>` : ""}
        ${isMissingNum ? `<span class="badge-geo-alert missing" title="\u0110\u1ECBa ch\u1EC9 thi\u1EBFu s\u1ED1 nh\xE0 c\u1EE5 th\u1EC3 (ch\u1EC9 c\xF3 t\xEAn \u0111\u01B0\u1EDDng/ph\u01B0\u1EDDng). H\xE3y g\u1ECDi kh\xE1ch khi t\u1EDBi g\u1EA7n!">\u26A0\uFE0F Thi\u1EBFu s\u1ED1</span>` : ""}
        ${isHealed ? `<span class="badge-geo-alert healed" title="T\u1ECDa \u0111\u1ED9 \u0111\xE3 \u0111\u01B0\u1EE3c h\u1EC7 th\u1ED1ng t\u1EF1 \u0111\u1ED9ng n\u1EAFn chu\u1EA9n">\u26A1 \u0110\xE3 n\u1EAFn GPS</span>` : ""}
        ${isOutlier ? `<span class="badge-geo-alert outlier" title="T\u1ECDa \u0111\u1ED9 b\u1ECB l\u1EC7ch > ${order.gpsOutlierDist || 1e3}m so v\u1EDBi tuy\u1EBFn \u0111\u01B0\u1EDDng">\u26A0\uFE0F L\u1EC7ch GPS</span>` : ""}
        <div class="order-price-group">
          <span class="cod-badge" title="Ti\u1EC1n thu h\u1ED9 / Ph\u1EA3i thu">${formatCurrency(order.codAmount)}</span>
          ${order.gtbThu ? `<span class="gtb-badge" title="Ti\u1EC1n thu khi Giao Th\u1EA5t B\u1EA1i (GTB)">GTB: ${formatCurrency(order.gtbThu)}</span>` : ""}
        </div>
      </div>

      <div class="order-recipient">
        <span class="customer-name">${escapeHtml(order.customerName || "Kh\xE1ch h\xE0ng")}</span>
        ${order.phone ? `
          <a href="tel:${order.phone}" class="customer-phone" title="G\u1ECDi \u0111i\u1EC7n cho kh\xE1ch">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
            </svg>
            ${order.phone}
          </a>
        ` : ""}
        ${secPhone ? `
          <a href="tel:${secPhone}" class="customer-phone sec-phone" title="S\u1ED1 \u0111i\u1EC7n tho\u1EA1i ph\u1EE5 b\xF3c t\xE1ch t\u1EEB \u0111\u1ECBa ch\u1EC9">
            \u{1F4DE} Ph\u1EE5: ${secPhone}
          </a>
        ` : ""}
        <span class="order-group-select-badge" title="B\u1EA5m \u0111\u1EC3 chuy\u1EC3n nh\xF3m">\u{1F4C1} ${escapeHtml(groupName || "Ch\u01B0a ph\xE2n nh\xF3m")}</span>
      </div>

      <div class="order-address">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        <span>
          ${escapeHtml(order.address || "Kh\xF4ng c\xF3 \u0111\u1ECBa ch\u1EC9")}
          ${hasGps ? `
            <button type="button" class="btn-desktop-jump-map" data-order-id="${order.id}" title="Xem v\u1ECB tr\xED tr\xEAn b\u1EA3n \u0111\u1ED3 l\u1ED9 tr\xECnh">
              \u{1F5FA}\uFE0F B\u1EA3n \u0111\u1ED3
            </button>
          ` : ""}
          <button type="button" class="btn-desktop-edit-loc" data-order-id="${order.id}" title="Ch\u1EC9nh s\u1EEDa ho\u1EB7c ghim l\u1EA1i v\u1ECB tr\xED GPS ch\xEDnh x\xE1c">
            \u{1F4CD} S\u1EEDa v\u1ECB tr\xED
          </button>
          ${order.address || hasGps ? `
            <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="maps-link" title="D\u1EABn \u0111\u01B0\u1EDDng Google Maps">
              \u{1F9ED} Ch\u1EC9 \u0111\u01B0\u1EDDng \u2197
            </a>
          ` : ""}
        </span>
      </div>

      ${order.notes ? `
        <div class="order-note-alert">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>${escapeHtml(order.notes)}</span>
        </div>
      ` : ""}
    </div>

    <!-- C\u1ED9t thao t\xE1c GTB / GTC v\xE0 X\xF3a -->
    <div class="order-actions-col">
      <div class="gtb-gtc-group">
        <button class="btn-status-gtc ${order.status === "gtc" ? "active" : ""}" title="Giao th\xE0nh c\xF4ng">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          GTC
        </button>
        <button class="btn-status-gtb ${order.status === "gtb" ? "active" : ""}" title="Giao th\u1EA5t b\u1EA1i">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          GTB
        </button>
      </div>
      <div class="order-sub-actions">
        <button class="btn-icon-del" title="X\xF3a \u0111\u01A1n n\xE0y">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    </div>
  `;
    const btnGtc = card.querySelector(".btn-status-gtc");
    btnGtc.addEventListener("click", (e) => {
      e.stopPropagation();
      const newStatus = order.status === "gtc" ? "pending" : "gtc";
      currentOrders = StorageService.updateOrderStatus(order.id, newStatus);
      renderApp();
      showToast(newStatus === "gtc" ? "\u0110\xE3 \u0111\xE1nh d\u1EA5u: Giao th\xE0nh c\xF4ng (GTC)" : "\u0110\xE3 chuy\u1EC3n v\u1EC1: Ch\u1EDD giao", "success");
    });
    const btnGtb = card.querySelector(".btn-status-gtb");
    btnGtb.addEventListener("click", (e) => {
      e.stopPropagation();
      const newStatus = order.status === "gtb" ? "pending" : "gtb";
      currentOrders = StorageService.updateOrderStatus(order.id, newStatus);
      renderApp();
      if (newStatus === "gtb") {
        const gtbMsg = order.gtbThu ? `\u0110\xE3 \u0111\xE1nh d\u1EA5u: GTB (C\u1EA7n thu: ${formatCurrency(order.gtbThu)})` : "\u0110\xE3 \u0111\xE1nh d\u1EA5u: Giao th\u1EA5t b\u1EA1i (GTB)";
        showToast(gtbMsg, "error");
      } else {
        showToast("\u0110\xE3 chuy\u1EC3n v\u1EC1: Ch\u1EDD giao", "info");
      }
    });
    const btnDel = card.querySelector(".btn-icon-del");
    btnDel.addEventListener("click", (e) => {
      e.stopPropagation();
      if (confirm(`B\u1EA1n c\xF3 ch\u1EAFc mu\u1ED1n x\xF3a \u0111\u01A1n h\xE0ng ${order.trackingCode}?`)) {
        currentOrders = StorageService.deleteOrder(order.id);
        renderApp();
        showToast("\u0110\xE3 x\xF3a \u0111\u01A1n h\xE0ng kh\u1ECFi danh s\xE1ch!", "info");
      }
    });
    const grpBadge = card.querySelector(".order-group-select-badge");
    if (grpBadge) {
      grpBadge.addEventListener("click", (e) => {
        e.stopPropagation();
        promptChangeOrderGroup(order.id);
      });
    }
    const trackingEl = card.querySelector(".tracking-code");
    trackingEl.addEventListener("click", () => {
      if (order.trackingCode) {
        navigator.clipboard.writeText(order.trackingCode).then(() => {
          showToast(`\u0110\xE3 sao ch\xE9p: ${order.trackingCode}`, "info");
        });
      }
    });
    const btnJump = card.querySelector(".btn-desktop-jump-map");
    if (btnJump) {
      btnJump.addEventListener("click", (e) => {
        e.stopPropagation();
        jumpToDesktopMapOrder(order.id);
      });
    }
    const btnEditLoc = card.querySelector(".btn-desktop-edit-loc");
    if (btnEditLoc) {
      btnEditLoc.addEventListener("click", (e) => {
        e.stopPropagation();
        openDesktopUpdateLocModal(order, routeNumber);
      });
    }
    const tripIdx = activeOrders.findIndex((o) => o.id === order.id);
    const btnUp = card.querySelector(".btn-move-up");
    const btnDown = card.querySelector(".btn-move-down");
    if (btnUp) {
      btnUp.disabled = tripIdx <= 0;
      btnUp.addEventListener("click", (e) => {
        e.stopPropagation();
        if (tripIdx > 0) {
          const prevOrder = activeOrders[tripIdx - 1];
          const curIdx = currentOrders.findIndex((o) => o.id === order.id);
          const prevIdx = currentOrders.findIndex((o) => o.id === prevOrder.id);
          if (curIdx !== -1 && prevIdx !== -1) {
            const [movedItem] = currentOrders.splice(curIdx, 1);
            currentOrders.splice(prevIdx, 0, movedItem);
            StorageService.reorderOrders(currentOrders);
            renderApp();
          }
        }
      });
    }
    if (btnDown) {
      btnDown.disabled = tripIdx >= activeOrders.length - 1;
      btnDown.addEventListener("click", (e) => {
        e.stopPropagation();
        if (tripIdx < activeOrders.length - 1) {
          const nextOrder = activeOrders[tripIdx + 1];
          const curIdx = currentOrders.findIndex((o) => o.id === order.id);
          const nextIdx = currentOrders.findIndex((o) => o.id === nextOrder.id);
          if (curIdx !== -1 && nextIdx !== -1) {
            const [movedItem] = currentOrders.splice(curIdx, 1);
            currentOrders.splice(nextIdx, 0, movedItem);
            StorageService.reorderOrders(currentOrders);
            renderApp();
          }
        }
      });
    }
    setupDragAndDrop(card, order.id);
    return card;
  }
  function setupDragAndDrop(card, orderId) {
    card.addEventListener("dragstart", (e) => {
      draggedOrderId = orderId;
      e.dataTransfer.setData("text/plain", orderId);
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("dragging");
      draggedOrderId = null;
      document.querySelectorAll(".order-card").forEach((el) => el.classList.remove("drag-over"));
    });
    card.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (draggedOrderId !== orderId) {
        card.classList.add("drag-over");
      }
    });
    card.addEventListener("dragleave", () => {
      card.classList.remove("drag-over");
    });
    card.addEventListener("drop", (e) => {
      e.preventDefault();
      card.classList.remove("drag-over");
      const sourceId = e.dataTransfer.getData("text/plain") || draggedOrderId;
      const targetId = orderId;
      if (!sourceId || sourceId === targetId) return;
      const fromIndex = currentOrders.findIndex((o) => o.id === sourceId);
      const toIndex = currentOrders.findIndex((o) => o.id === targetId);
      if (fromIndex !== -1 && toIndex !== -1) {
        const [movedItem] = currentOrders.splice(fromIndex, 1);
        currentOrders.splice(toIndex, 0, movedItem);
        StorageService.reorderOrders(currentOrders);
        renderOrderList();
        showToast("\u0110\xE3 c\u1EADp nh\u1EADt th\u1EE9 t\u1EF1 l\u1ED9 tr\xECnh giao h\xE0ng!", "info");
      }
    });
  }
  function showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }
  function escapeHtml(text) {
    if (!text) return "";
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }
  function parseCoordsInput(str) {
    if (!str) return null;
    const m1 = str.match(/(1[0-9]\.\d{3,9})\s*[,;\s]\s*(10[2-9]\.\d{3,9})/);
    if (m1) {
      return { lat: parseFloat(m1[1]), lng: parseFloat(m1[2]) };
    }
    const m2 = str.match(/@([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/);
    if (m2 && isValidCoordinate(m2[1], m2[2])) {
      return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) };
    }
    const m3 = str.match(/q=([0-9]+\.[0-9]+),([0-9]+\.[0-9]+)/);
    if (m3 && isValidCoordinate(m3[1], m3[2])) {
      return { lat: parseFloat(m3[1]), lng: parseFloat(m3[2]) };
    }
    return null;
  }
  function findSimilarAddressOrders(targetOrder, allOrders) {
    if (!targetOrder || !targetOrder.address) return [];
    function cleanText(str) {
      if (!str) return "";
      return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").replace(/[.,\-\/#!$%\^&\*;:{}=\-_`~()]/g, " ").replace(/\s+/g, " ").trim();
    }
    const targetClean = cleanText(targetOrder.address);
    const targetTokens = targetClean.split(" ").filter(
      (w) => w.length > 1 && !["tp", "hcm", "thanh", "pho", "quan", "phuong", "duong", "so", "nha", "toa", "tang", "phong", "viet", "nam"].includes(w)
    );
    const targetNumbers = targetClean.match(/\b\d+\b/g) || [];
    const candidates = [];
    const landmarks = ["centec", "vincom", "diamond", "landmark", "bitexco", "saigon", "times", "cantavil", "masteri", "vinhomes", "pearl", "riverpark", "sunwah", "lim", "mplaza", "me linh"];
    for (let i = 0; i < allOrders.length; i++) {
      const o = allOrders[i];
      if (o.id === targetOrder.id) continue;
      if (!isValidCoordinate(o.lat, o.lng)) continue;
      if (!o.address) continue;
      const otherClean = cleanText(o.address);
      const otherTokens = otherClean.split(" ").filter(
        (w) => w.length > 1 && !["tp", "hcm", "thanh", "pho", "quan", "phuong", "duong", "so", "nha", "toa", "tang", "phong", "viet", "nam"].includes(w)
      );
      const otherNumbers = otherClean.match(/\b\d+\b/g) || [];
      if (otherTokens.length === 0) continue;
      let commonTokens = 0;
      for (let t = 0; t < targetTokens.length; t++) {
        if (otherTokens.includes(targetTokens[t])) commonTokens++;
      }
      const dice = 2 * commonTokens / (targetTokens.length + otherTokens.length);
      let score = dice * 55;
      let hasSameNumber = false;
      for (let n = 0; n < targetNumbers.length; n++) {
        if (otherNumbers.includes(targetNumbers[n])) {
          hasSameNumber = true;
          break;
        }
      }
      if (hasSameNumber) score += 25;
      for (let l = 0; l < landmarks.length; l++) {
        const lm = landmarks[l];
        if (targetClean.includes(lm) && otherClean.includes(lm)) {
          score += 35;
          break;
        }
      }
      const finalPct = Math.min(Math.round(score), 99);
      if (finalPct >= 35) {
        const origIdx = allOrders.indexOf(o);
        candidates.push({
          order: o,
          stt: origIdx !== -1 ? origIdx + 1 : "",
          score: finalPct
        });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates.slice(0, 5);
  }
  function openDesktopUpdateLocModal(order, stt) {
    targetUpdateOrder = order;
    const modal = document.getElementById("updateLocationModal");
    if (!modal) return;
    const activeOrders = getActiveTripOrders();
    const routeNum = stt || activeOrders.findIndex((o) => o.id === order.id) + 1 || 1;
    const sttEl = document.getElementById("updTargetStt");
    const nameEl = document.getElementById("updTargetName");
    const trkEl = document.getElementById("updTargetTrk");
    const addrEl = document.getElementById("updTargetAddr");
    const gpsTextEl = document.getElementById("updTargetGpsText");
    const manualInput = document.getElementById("updManualInput");
    if (sttEl) sttEl.textContent = "#" + routeNum;
    if (nameEl) nameEl.textContent = order.customerName || "Kh\xE1ch l\u1EBB";
    if (trkEl) trkEl.textContent = order.trackingCode || "";
    if (addrEl) addrEl.textContent = order.address || "Ch\u01B0a c\xF3 \u0111\u1ECBa ch\u1EC9";
    const hasGps = isValidCoordinate(order.lat, order.lng);
    if (gpsTextEl) {
      gpsTextEl.textContent = hasGps ? `${Number(order.lat).toFixed(6)}, ${Number(order.lng).toFixed(6)}` : "Ch\u01B0a c\xF3 GPS";
    }
    if (manualInput) {
      manualInput.value = hasGps ? `${order.lat}, ${order.lng}` : "";
    }
    const osmBox = document.getElementById("updOsmResultBox");
    if (osmBox) osmBox.style.display = "none";
    const info = extractStreetAndHouseNumber(order.address);
    const sameAddrOrders = currentOrders.filter((o) => {
      if (o.id === order.id || !o.address) return false;
      const sameRaw = o.address.trim().toLowerCase() === (order.address || "").trim().toLowerCase();
      if (sameRaw) return true;
      if (info.street && info.houseNumber && info.street !== "Ch\u01B0a r\xF5 \u0111\u01B0\u1EDDng") {
        const otherInfo = extractStreetAndHouseNumber(o.address);
        return otherInfo.street === info.street && otherInfo.houseNumber === info.houseNumber;
      }
      return false;
    });
    const sameSection = document.getElementById("updSameAddrSection");
    const sameCountEl = document.getElementById("updSameAddrCount");
    const btnSyncSame = document.getElementById("btnUpdSyncSameAddr");
    if (sameSection && sameCountEl) {
      if (sameAddrOrders.length > 0) {
        sameCountEl.textContent = `${sameAddrOrders.length + 1} \u0111\u01A1n`;
        sameSection.style.display = "block";
        if (btnSyncSame) {
          btnSyncSame.onclick = () => {
            if (!isValidCoordinate(order.lat, order.lng)) {
              showToast("\u0110\u01A1n n\xE0y ch\u01B0a c\xF3 t\u1ECDa \u0111\u1ED9 h\u1EE3p l\u1EC7 \u0111\u1EC3 \u0111\u1ED3ng b\u1ED9!", "error");
              return;
            }
            sameAddrOrders.forEach((o) => {
              o.lat = order.lat;
              o.lng = order.lng;
              o.isGpsHealed = true;
              o.isGpsOutlier = false;
            });
            StorageService.saveOrders(currentOrders);
            renderApp();
            modal.style.display = "none";
            showToast(`\u26A1 \u0110\xE3 \u0111\u1ED3ng b\u1ED9 t\u1ECDa \u0111\u1ED9 cho t\u1EA5t c\u1EA3 ${sameAddrOrders.length + 1} \u0111\u01A1n c\xF9ng \u0111\u1ECBa ch\u1EC9!`, "success");
          };
        }
      } else {
        sameSection.style.display = "none";
      }
    }
    const suggestions = findSimilarAddressOrders(order, currentOrders);
    const sugList = document.getElementById("updSuggestionsList");
    const sugBadge = document.getElementById("updSuggestCount");
    if (sugBadge) sugBadge.textContent = `${suggestions.length} g\u1EE3i \xFD`;
    if (sugList) {
      sugList.innerHTML = "";
      if (suggestions.length === 0) {
        sugList.innerHTML = '<div style="font-size: 11.5px; color: #94a3b8; text-align: center; padding: 12px; background: #f8fafc; border-radius: 6px;">Kh\xF4ng t\xECm th\u1EA5y \u0111\u01A1n n\xE0o kh\xE1c c\xF3 \u0111\u1ECBa ch\u1EC9 t\u01B0\u01A1ng t\u1EF1</div>';
      } else {
        suggestions.forEach((sug) => {
          const card = document.createElement("div");
          card.className = "upd-suggest-card";
          card.innerHTML = `
          <div class="upd-suggest-info">
            <div class="upd-suggest-title">
              <span>#${sug.stt} ${escapeHtml(sug.order.customerName || "Kh\xE1ch l\u1EBB")}</span>
              <span class="upd-suggest-score">${sug.score}% kh\u1EDBp</span>
            </div>
            <div class="upd-suggest-addr" title="${escapeHtml(sug.order.address)}">\u{1F4CD} ${escapeHtml(sug.order.address)}</div>
          </div>
          <div class="upd-suggest-actions">
            <button type="button" class="btn-preview-suggest" title="Xem v\u1ECB tr\xED tr\xEAn b\u1EA3n \u0111\u1ED3">\u{1F50D} Xem Map</button>
            <button type="button" class="btn-apply-suggest" title="\xC1p d\u1EE5ng t\u1ECDa \u0111\u1ED9 n\xE0y">\u2713 \xC1p d\u1EE5ng</button>
          </div>
        `;
          card.querySelector(".btn-preview-suggest").addEventListener("click", (e) => {
            e.stopPropagation();
            modal.style.display = "none";
            switchDesktopView("map");
            if (desktopMap) {
              desktopMap.flyTo([Number(sug.order.lat), Number(sug.order.lng)], 17, { duration: 1.2 });
              showToast(`\u0110ang xem v\u1ECB tr\xED g\u1EE3i \xFD t\u1EEB \u0111\u01A1n #${sug.stt}`, "info");
            }
          });
          card.querySelector(".btn-apply-suggest").addEventListener("click", (e) => {
            e.stopPropagation();
            order.lat = Number(sug.order.lat);
            order.lng = Number(sug.order.lng);
            order.isGpsHealed = true;
            order.isGpsOutlier = false;
            StorageService.saveOrders(currentOrders);
            renderApp();
            modal.style.display = "none";
            showToast(`\u2713 \u0110\xE3 \xE1p d\u1EE5ng t\u1ECDa \u0111\u1ED9 t\u1EEB \u0111\u01A1n #${sug.stt}!`, "success");
          });
          sugList.appendChild(card);
        });
      }
    }
    modal.style.display = "flex";
  }
  window.openDesktopUpdateLocModalById = function(orderId, stt) {
    const order = currentOrders.find((o) => o.id === orderId);
    if (order) {
      openDesktopUpdateLocModal(order, stt);
    }
  };
  function setupDesktopUpdateLocationModal() {
    const modal = document.getElementById("updateLocationModal");
    const btnClose = document.getElementById("btnCloseUpdateLocModal");
    if (btnClose && modal) {
      btnClose.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }
    if (modal) {
      window.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.style.display = "none";
        }
      });
    }
    const btnPickMap = document.getElementById("btnUpdPickMap");
    if (btnPickMap) {
      btnPickMap.addEventListener("click", () => {
        if (!targetUpdateOrder) return;
        const pickingOrder = targetUpdateOrder;
        const stt = getActiveTripOrders().findIndex((o) => o.id === pickingOrder.id) + 1;
        if (modal) modal.style.display = "none";
        switchDesktopView("map");
        showToast(`\u{1F3AF} Ch\u1EBF \u0111\u1ED9 ch\u1EA5m \u0111i\u1EC3m: H\xE3y b\u1EA5m 1 \u0111i\u1EC3m tr\xEAn b\u1EA3n \u0111\u1ED3 \u0111\u1EC3 ghim v\u1ECB tr\xED cho \u0111\u01A1n #${stt}!`, "info");
        if (desktopMap) {
          desktopMap.once("click", (e) => {
            const lat = Number(e.latlng.lat.toFixed(6));
            const lng = Number(e.latlng.lng.toFixed(6));
            pickingOrder.lat = lat;
            pickingOrder.lng = lng;
            pickingOrder.isGpsHealed = true;
            pickingOrder.isGpsOutlier = false;
            StorageService.saveOrders(currentOrders);
            renderApp();
            showToast(`\u2713 \u0110\xE3 ghim th\xE0nh c\xF4ng t\u1ECDa \u0111\u1ED9 [${lat}, ${lng}] cho \u0111\u01A1n #${stt}!`, "success");
          });
        }
      });
    }
    const btnStreetMedian = document.getElementById("btnUpdStreetMedian");
    if (btnStreetMedian) {
      btnStreetMedian.addEventListener("click", () => {
        if (!targetUpdateOrder) return;
        const info = extractStreetAndHouseNumber(targetUpdateOrder.address);
        const streetOrders = currentOrders.filter((o) => {
          return o.id !== targetUpdateOrder.id && isValidCoordinate(o.lat, o.lng) && extractStreetAndHouseNumber(o.address).street === info.street;
        });
        if (streetOrders.length === 0) {
          showToast(`Kh\xF4ng c\xF3 \u0111\u01A1n n\xE0o kh\xE1c c\xF9ng \u0111\u01B0\u1EDDng "${info.street}" c\xF3 t\u1ECDa \u0111\u1ED9!`, "info");
          return;
        }
        streetOrders.sort((a, b) => Number(a.lat) - Number(b.lat));
        const mid = Math.floor(streetOrders.length / 2);
        const medLat = Number(streetOrders[mid].lat);
        const medLng = Number(streetOrders[mid].lng);
        targetUpdateOrder.lat = medLat;
        targetUpdateOrder.lng = medLng;
        targetUpdateOrder.isGpsHealed = true;
        targetUpdateOrder.isGpsOutlier = false;
        StorageService.saveOrders(currentOrders);
        renderApp();
        if (modal) modal.style.display = "none";
        showToast(`\u2713 \u0110\xE3 \xE1p d\u1EE5ng t\u1ECDa \u0111\u1ED9 trung v\u1ECB \u0111\u01B0\u1EDDng "${info.street}" (${streetOrders.length} \u0111\u01A1n)`, "success");
      });
    }
    const btnOsm = document.getElementById("btnUpdOsmSearch");
    const osmBox = document.getElementById("updOsmResultBox");
    const osmStatus = document.getElementById("updOsmStatusText");
    const btnApplyOsm = document.getElementById("btnApplyOsmResult");
    let tempOsmCoords = null;
    if (btnOsm) {
      btnOsm.addEventListener("click", () => {
        if (!targetUpdateOrder || !targetUpdateOrder.address) return;
        if (osmBox) osmBox.style.display = "block";
        if (osmStatus) osmStatus.textContent = "\u23F3 \u0110ang tra c\u1EE9u OpenStreetMap...";
        if (btnApplyOsm) btnApplyOsm.style.display = "none";
        const cleanAddr = targetUpdateOrder.address.replace(/[<>]/g, "").trim();
        const queryUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleanAddr)}&countrycodes=vn&limit=1`;
        fetch(queryUrl, { headers: { "Accept": "application/json" } }).then((res) => res.json()).then((data) => {
          if (data && data.length > 0 && data[0].lat && data[0].lon) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            tempOsmCoords = { lat, lng, displayName: data[0].display_name };
            if (osmStatus) osmStatus.innerHTML = `\u2713 T\xECm th\u1EA5y: <strong>${lat.toFixed(6)}, ${lng.toFixed(6)}</strong> (${escapeHtml(data[0].display_name.slice(0, 45))}...)`;
            if (btnApplyOsm) btnApplyOsm.style.display = "inline-block";
          } else {
            const info = extractStreetAndHouseNumber(cleanAddr);
            const fbQuery = `\u0110\u01B0\u1EDDng ${info.street}, TP. H\u1ED3 Ch\xED Minh`;
            return fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(fbQuery)}&countrycodes=vn&limit=1`).then((r) => r.json()).then((d2) => {
              if (d2 && d2.length > 0 && d2[0].lat && d2[0].lon) {
                const lat2 = parseFloat(d2[0].lat);
                const lng2 = parseFloat(d2[0].lon);
                tempOsmCoords = { lat: lat2, lng: lng2, displayName: d2[0].display_name };
                if (osmStatus) osmStatus.innerHTML = `\u2713 T\xECm th\u1EA5y theo tuy\u1EBFn \u0111\u01B0\u1EDDng: <strong>${lat2.toFixed(6)}, ${lng2.toFixed(6)}</strong>`;
                if (btnApplyOsm) btnApplyOsm.style.display = "inline-block";
              } else {
                if (osmStatus) osmStatus.textContent = "\u274C Kh\xF4ng t\xECm th\u1EA5y t\u1ECDa \u0111\u1ED9 ph\xF9 h\u1EE3p tr\xEAn OpenStreetMap";
                if (btnApplyOsm) btnApplyOsm.style.display = "none";
              }
            });
          }
        }).catch((err) => {
          if (osmStatus) osmStatus.textContent = `\u274C L\u1ED7i k\u1EBFt n\u1ED1i OSM: ${err.message || "Kh\xF4ng th\u1EC3 tra c\u1EE9u"}`;
          if (btnApplyOsm) btnApplyOsm.style.display = "none";
        });
      });
    }
    if (btnApplyOsm) {
      btnApplyOsm.addEventListener("click", () => {
        if (tempOsmCoords && targetUpdateOrder) {
          targetUpdateOrder.lat = tempOsmCoords.lat;
          targetUpdateOrder.lng = tempOsmCoords.lng;
          targetUpdateOrder.isGpsHealed = true;
          targetUpdateOrder.isGpsOutlier = false;
          StorageService.saveOrders(currentOrders);
          renderApp();
          if (modal) modal.style.display = "none";
          showToast("\u2713 \u0110\xE3 c\u1EADp nh\u1EADt t\u1ECDa \u0111\u1ED9 t\u1EEB OpenStreetMap!", "success");
        }
      });
    }
    const btnMyGps = document.getElementById("btnUpdMyGps");
    if (btnMyGps) {
      btnMyGps.addEventListener("click", () => {
        if (!targetUpdateOrder) return;
        if (!navigator.geolocation) {
          showToast("Tr\xECnh duy\u1EC7t kh\xF4ng h\u1ED7 tr\u1EE3 GPS", "error");
          return;
        }
        showToast("\u0110ang l\u1EA5y v\u1ECB tr\xED GPS hi\u1EC7n t\u1EA1i...", "info");
        navigator.geolocation.getCurrentPosition((pos) => {
          targetUpdateOrder.lat = pos.coords.latitude;
          targetUpdateOrder.lng = pos.coords.longitude;
          targetUpdateOrder.isGpsHealed = true;
          targetUpdateOrder.isGpsOutlier = false;
          StorageService.saveOrders(currentOrders);
          renderApp();
          if (modal) modal.style.display = "none";
          showToast("\u2713 \u0110\xE3 c\u1EADp nh\u1EADt theo v\u1ECB tr\xED GPS m\xE1y t\xEDnh!", "success");
        }, (err) => {
          showToast(`L\u1ED7i GPS: ${err.message || "Kh\xF4ng th\u1EC3 x\xE1c \u0111\u1ECBnh v\u1ECB tr\xED"}`, "error");
        }, { enableHighAccuracy: true, timeout: 1e4 });
      });
    }
    const btnSaveManual = document.getElementById("btnUpdSaveManual");
    const manualInput = document.getElementById("updManualInput");
    if (btnSaveManual && manualInput) {
      btnSaveManual.addEventListener("click", () => {
        if (!targetUpdateOrder) return;
        const raw = manualInput.value.trim();
        if (!raw) {
          showToast("Vui l\xF2ng nh\u1EADp t\u1ECDa \u0111\u1ED9 ho\u1EB7c d\xE1n link Google Maps!", "error");
          return;
        }
        const parsed = parseCoordsInput(raw);
        if (parsed) {
          targetUpdateOrder.lat = parsed.lat;
          targetUpdateOrder.lng = parsed.lng;
          targetUpdateOrder.isGpsHealed = true;
          targetUpdateOrder.isGpsOutlier = false;
          StorageService.saveOrders(currentOrders);
          renderApp();
          if (modal) modal.style.display = "none";
          showToast(`\u2713 \u0110\xE3 l\u01B0u t\u1ECDa \u0111\u1ED9 [${parsed.lat}, ${parsed.lng}]!`, "success");
        } else {
          showToast("Kh\xF4ng nh\u1EADn di\u1EC7n \u0111\u01B0\u1EE3c t\u1ECDa \u0111\u1ED9 h\u1EE3p l\u1EC7 (c\u1EA7n d\u1EA1ng lat, lng)!", "error");
        }
      });
    }
  }
  function setupDesktopUnmappedModal() {
    const modal = document.getElementById("unmappedModal");
    const btnClose = document.getElementById("btnCloseUnmappedModal");
    const unmappedChip = document.getElementById("dMapUnmappedChip");
    const listEl = document.getElementById("unmappedOrdersList");
    function openModal() {
      if (!modal || !listEl) return;
      const activeOrders = getActiveTripOrders();
      const unmapped = activeOrders.filter((o) => !isValidCoordinate(o.lat, o.lng));
      listEl.innerHTML = "";
      if (unmapped.length === 0) {
        listEl.innerHTML = '<div style="font-size: 13px; color: #166534; background: #f0fdf4; padding: 12px; border-radius: 8px; text-align: center; font-weight: 600;">\u{1F389} Tuy\u1EC7t v\u1EDDi! T\u1EA5t c\u1EA3 \u0111\u01A1n trong chuy\u1EBFn \u0111\u1EC1u \u0111\xE3 c\xF3 t\u1ECDa \u0111\u1ED9 GPS.</div>';
      } else {
        unmapped.forEach((o) => {
          const routeNum = activeOrders.findIndex((item) => item.id === o.id) + 1;
          const row = document.createElement("div");
          row.style.cssText = "background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; gap: 8px;";
          row.innerHTML = `
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; gap: 6px; align-items: center; margin-bottom: 2px;">
              <span style="background: #001f3f; color: #fff; font-size: 11px; font-weight: 700; padding: 1px 6px; border-radius: 4px;">#${routeNum}</span>
              <strong style="font-size: 13px; color: #0f172a;">${escapeHtml(o.customerName || "Kh\xE1ch l\u1EBB")}</strong>
              <code style="font-size: 11px; color: #2563eb;">${escapeHtml(o.trackingCode || "")}</code>
            </div>
            <div style="font-size: 12px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\u{1F4CD} ${escapeHtml(o.address || "Ch\u01B0a c\xF3 \u0111\u1ECBa ch\u1EC9")}</div>
          </div>
          <button type="button" class="btn-quick-fix-loc" style="background: #2563eb; color: #fff; border: none; border-radius: 6px; padding: 6px 12px; font-size: 11.5px; font-weight: 700; cursor: pointer; white-space: nowrap;">
            \u{1F4CD} \u0110\u1ECBnh v\u1ECB ngay
          </button>
        `;
          row.querySelector(".btn-quick-fix-loc").addEventListener("click", () => {
            modal.style.display = "none";
            openDesktopUpdateLocModal(o, routeNum);
          });
          listEl.appendChild(row);
        });
      }
      modal.style.display = "flex";
    }
    if (unmappedChip) {
      unmappedChip.addEventListener("click", openModal);
    }
    if (btnClose && modal) {
      btnClose.addEventListener("click", () => {
        modal.style.display = "none";
      });
    }
    if (modal) {
      window.addEventListener("click", (e) => {
        if (e.target === modal) {
          modal.style.display = "none";
        }
      });
    }
  }
  function setupDesktopAiRouteModal() {
    const btnOpen = document.getElementById("btnOpenAiRouteDesktop");
    const modal = document.getElementById("aiRouteModalDesktop");
    const btnClose = document.getElementById("btnCloseAiRouteModalDesktop");
    if (!btnOpen || !modal) return;
    const tabBtnOptimize = document.getElementById("tabBtnAiOptimizeDesktop");
    const tabBtnConfig = document.getElementById("tabBtnAiConfigDesktop");
    const panelOptimize = document.getElementById("tabPanelAiOptimizeDesktop");
    const panelConfig = document.getElementById("tabPanelAiConfigDesktop");
    const pendingCountEl = document.getElementById("aiPendingCountDesktop");
    const groupCountEl = document.getElementById("aiGroupCountDesktop");
    const ruleCountEl = document.getElementById("aiRuleCountDesktop");
    const modeSelect = document.getElementById("aiModeSelectDesktop");
    const depotSelect = document.getElementById("aiDepotSelectDesktop");
    const depotAddrEl = document.getElementById("aiDepotAddressDesktop");
    const startOriginSelect = document.getElementById("aiStartOriginSelectDesktop");
    const chkReturnToDepot = document.getElementById("aiReturnToDepotDesktop");
    const boxStartDist = document.getElementById("aiBoxStartDistanceDesktop");
    const resStartDist = document.getElementById("aiResStartDistanceDesktop");
    const boxReturnDist = document.getElementById("aiBoxReturnDistanceDesktop");
    const resReturnDist = document.getElementById("aiResReturnDistanceDesktop");
    const resDistLabel = document.getElementById("aiResDistLabelDesktop");
    const chkAvoidUTurn = document.getElementById("aiAvoidUTurnDesktop");
    const chkClusterBuildings = document.getElementById("aiClusterBuildingsDesktop");
    const btnRun = document.getElementById("btnRunAiOptimizeDesktop");
    const runBtnText = document.getElementById("aiRunBtnTextDesktop");
    const runStatus = document.getElementById("aiRunStatusDesktop");
    const resultBox = document.getElementById("aiResultBoxDesktop");
    const resStops = document.getElementById("aiResStopsDesktop");
    const resDist = document.getElementById("aiResDistanceDesktop");
    const resEngine = document.getElementById("aiResEngineDesktop");
    const expEl = document.getElementById("aiExplanationDesktop");
    const previewList = document.getElementById("aiPreviewStopsListDesktop");
    const btnApply = document.getElementById("btnApplyAiRouteDesktop");
    const btnSync = document.getElementById("btnSyncAfterAiDesktop");
    const inputEndpoint = document.getElementById("aiCfgEndpointDesktop");
    const inputModel = document.getElementById("aiCfgModelDesktop");
    const inputTimeout = document.getElementById("aiCfgTimeoutDesktop");
    const inputApiKey = document.getElementById("aiCfgApiKeyDesktop");
    const btnTestConn = document.getElementById("btnTestAiConnectionDesktop");
    const btnSaveCfg = document.getElementById("btnSaveAiConfigDesktop");
    const connStatus = document.getElementById("aiConnectionStatusDesktop");
    document.querySelectorAll(".btn-desktop-model-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (inputModel && btn.dataset.model) {
          inputModel.value = btn.dataset.model;
        }
      });
    });
    let lastOptimizedResult = null;
    function loadDesktopDepotUI() {
      const aiOpt = window.AIRouteOptimizer;
      if (!aiOpt || !depotSelect) return;
      const presets = aiOpt.getPresetDepots ? aiOpt.getPresetDepots() : [];
      const currentDepot = aiOpt.getDepot ? aiOpt.getDepot() : null;
      depotSelect.innerHTML = "";
      presets.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = "\u{1F3E2} " + p.name;
        if (currentDepot && currentDepot.name === p.name) {
          opt.selected = true;
        }
        depotSelect.appendChild(opt);
      });
      if (currentDepot && depotAddrEl) {
        depotAddrEl.textContent = currentDepot.address || "";
      }
    }
    if (depotSelect) {
      depotSelect.addEventListener("change", () => {
        const aiOpt = window.AIRouteOptimizer;
        if (!aiOpt || !aiOpt.getPresetDepots) return;
        const presets = aiOpt.getPresetDepots();
        const chosen = presets.find((p) => p.name === depotSelect.value);
        if (chosen) {
          aiOpt.saveDepot(chosen);
          if (depotAddrEl) depotAddrEl.textContent = chosen.address || "";
          showToast("\u0110\xE3 ch\u1ECDn b\u01B0u c\u1EE5c: " + chosen.name, "success");
        }
      });
    }
    if (tabBtnOptimize && tabBtnConfig) {
      tabBtnOptimize.addEventListener("click", () => {
        tabBtnOptimize.classList.add("active");
        tabBtnConfig.classList.remove("active");
        panelOptimize.classList.add("active");
        panelConfig.classList.remove("active");
      });
      tabBtnConfig.addEventListener("click", () => {
        tabBtnConfig.classList.add("active");
        tabBtnOptimize.classList.remove("active");
        panelConfig.classList.add("active");
        panelOptimize.classList.remove("active");
        loadAiConfig();
      });
    }
    function loadAiConfig() {
      const aiOpt = window.AIRouteOptimizer;
      if (!aiOpt) return;
      const cfg = aiOpt.getConfig();
      if (inputEndpoint) inputEndpoint.value = cfg.endpoint || "";
      if (inputModel) inputModel.value = cfg.model || "";
      if (inputApiKey) inputApiKey.value = cfg.apiKey || "";
      if (inputTimeout && cfg.timeoutMs) inputTimeout.value = String(cfg.timeoutMs);
    }
    function openModal() {
      loadAiConfig();
      loadDesktopDepotUI();
      const activeOrders = typeof getActiveTripOrders === "function" ? getActiveTripOrders() : currentOrders;
      const pending = activeOrders.filter((o) => o.status === "pending");
      const rules = StorageService.getGroupRules ? StorageService.getGroupRules() : [];
      if (pendingCountEl) pendingCountEl.textContent = pending.length;
      if (groupCountEl) groupCountEl.textContent = currentGroups.length;
      if (ruleCountEl) ruleCountEl.textContent = rules.length;
      if (resultBox) resultBox.style.display = "none";
      if (runStatus) runStatus.style.display = "none";
      lastOptimizedResult = null;
      modal.style.display = "flex";
    }
    function closeModal() {
      modal.style.display = "none";
    }
    btnOpen.addEventListener("click", openModal);
    if (btnClose) btnClose.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
    if (btnTestConn) {
      btnTestConn.addEventListener("click", async () => {
        const aiOpt = window.AIRouteOptimizer;
        if (!aiOpt) {
          showToast("Ch\u01B0a n\u1EA1p module AI Route Optimizer!", "error");
          return;
        }
        connStatus.style.display = "block";
        connStatus.style.background = "#f1f5f9";
        connStatus.style.color = "#334155";
        connStatus.textContent = "\u23F3 \u0110ang ki\u1EC3m tra k\u1EBFt n\u1ED1i \u0111\u1EBFn 9Router...";
        btnTestConn.disabled = true;
        aiOpt.saveConfig({
          endpoint: inputEndpoint.value.trim(),
          model: inputModel.value.trim(),
          apiKey: inputApiKey.value.trim(),
          timeoutMs: inputTimeout ? parseInt(inputTimeout.value, 10) : 9e4
        });
        if (inputEndpoint) inputEndpoint.value = aiOpt.getEndpoint();
        const res = await aiOpt.testConnection();
        btnTestConn.disabled = false;
        if (res.success) {
          connStatus.style.background = "#f0fdf4";
          connStatus.style.color = "#166534";
          connStatus.textContent = "\u2713 " + res.message;
          showToast("K\u1EBFt n\u1ED1i 9Router th\xE0nh c\xF4ng!", "success");
        } else {
          connStatus.style.background = "#fef2f2";
          connStatus.style.color = "#991b1b";
          connStatus.textContent = "\u2715 L\u1ED7i k\u1EBFt n\u1ED1i: " + res.error;
          showToast("Kh\xF4ng th\u1EC3 k\u1EBFt n\u1ED1i 9Router: " + res.error, "error");
        }
      });
    }
    if (btnSaveCfg) {
      btnSaveCfg.addEventListener("click", () => {
        const aiOpt = window.AIRouteOptimizer;
        if (!aiOpt) return;
        aiOpt.saveConfig({
          endpoint: inputEndpoint.value.trim(),
          model: inputModel.value.trim(),
          apiKey: inputApiKey.value.trim(),
          timeoutMs: inputTimeout ? parseInt(inputTimeout.value, 10) : 9e4
        });
        if (inputEndpoint) inputEndpoint.value = aiOpt.getEndpoint();
        showToast("\u0110\xE3 l\u01B0u c\u1EA5u h\xECnh 9Router!", "success");
      });
    }
    if (btnRun) {
      btnRun.addEventListener("click", async () => {
        const aiOpt = window.AIRouteOptimizer;
        if (!aiOpt) {
          showToast("L\u1ED7i: Ch\u01B0a n\u1EA1p module AIRouteOptimizer!", "error");
          return;
        }
        const activeOrders = typeof getActiveTripOrders === "function" ? getActiveTripOrders() : currentOrders;
        const pending = activeOrders.filter((o) => o.status === "pending");
        if (pending.length === 0) {
          showToast("Kh\xF4ng c\xF3 \u0111\u01A1n h\xE0ng n\xE0o \u0111ang \u1EDF tr\u1EA1ng th\xE1i Ch\u1EDD Giao!", "warning");
          return;
        }
        const rules = StorageService.getGroupRules ? StorageService.getGroupRules() : [];
        const mode = modeSelect ? modeSelect.value : "auto";
        const avoidUTurn = chkAvoidUTurn ? chkAvoidUTurn.checked : true;
        const clusterBuildings = chkClusterBuildings ? chkClusterBuildings.checked : true;
        const chkStrictOneWay = document.getElementById("aiStrictOneWayDesktop");
        const strictOneWay = chkStrictOneWay ? chkStrictOneWay.checked : true;
        const originType = startOriginSelect ? startOriginSelect.value : "depot";
        const currentDepot = aiOpt.getDepot ? aiOpt.getDepot() : null;
        let startOrigin = null;
        if (originType === "depot" && currentDepot) {
          startOrigin = {
            lat: currentDepot.lat,
            lng: currentDepot.lng,
            name: currentDepot.name,
            address: currentDepot.address,
            isDepot: true
          };
        }
        const returnToDepot = chkReturnToDepot ? chkReturnToDepot.checked : true;
        btnRun.disabled = true;
        if (runBtnText) runBtnText.textContent = "\u0110ang ph\xE2n t\xEDch & t\u1ED1i \u01B0u...";
        if (runStatus) {
          runStatus.style.display = "block";
          runStatus.textContent = "\u23F3 AI 9Router \u0111ang \u0111\u1ECDc \u0111\u1ECBa ch\u1EC9 v\xE0 t\xEDnh to\xE1n l\u1ED9 tr\xECnh t\u1ED1i \u01B0u...";
        }
        let startTime = Date.now();
        let timer = setInterval(() => {
          const sec = Math.floor((Date.now() - startTime) / 1e3);
          if (runStatus) {
            const currentText = runStatus.getAttribute("data-status-text") || "AI \u0111ang ph\xE2n t\xEDch & t\u1ED1i \u01B0u l\u1ED9 tr\xECnh...";
            runStatus.textContent = `\u23F3 ${currentText} (${sec}s)`;
          }
        }, 1e3);
        const desktopBounds = typeof desktopMap !== "undefined" && desktopMap && desktopMap.getBounds ? {
          s: desktopMap.getBounds().getSouth(),
          w: desktopMap.getBounds().getWest(),
          n: desktopMap.getBounds().getNorth(),
          e: desktopMap.getBounds().getEast()
        } : null;
        await new Promise((resolve) => setTimeout(resolve, 60));
        try {
          const result = await aiOpt.optimizeRoute(pending, currentGroups, rules, {
            scenario: mode,
            startOrigin,
            depot: currentDepot,
            returnToDepot,
            avoidUTurn,
            clusterBuildings,
            strictOneWay,
            bounds: desktopBounds,
            onProgress: (info) => {
              if (runStatus && info) {
                const txt = info.detail || info.text || "\u0110ang x\u1EED l\xFD...";
                runStatus.setAttribute("data-status-text", txt);
                const sec = Math.floor((Date.now() - startTime) / 1e3);
                runStatus.textContent = `\u23F3 ${txt} (${sec}s)`;
              }
            }
          });
          lastOptimizedResult = result;
          if (resultBox) resultBox.style.display = "block";
          if (resStops) resStops.textContent = result.orderedOrders.length;
          if (boxStartDist && resStartDist) {
            if (result.startDistance != null && result.startDistance > 0) {
              boxStartDist.style.display = "block";
              resStartDist.textContent = "+" + (result.startDistance / 1e3).toFixed(1) + " km";
            } else {
              boxStartDist.style.display = "none";
            }
          }
          if (resDist) {
            const totalMeters = result.roundTripDistance != null ? result.roundTripDistance : result.totalDistance || 0;
            const km = (totalMeters / 1e3).toFixed(1);
            resDist.textContent = km + " km";
          }
          if (resDistLabel) {
            resDistLabel.textContent = result.returnToDepot ? "T\u1ED5ng ca (kh\xE9p k\xEDn)" : "\u01AF\u1EDBc t\xEDnh l\u1ED9 tr\xECnh";
          }
          if (boxReturnDist && resReturnDist) {
            if (result.returnToDepot && result.returnDistance != null) {
              boxReturnDist.style.display = "block";
              resReturnDist.textContent = "+" + (result.returnDistance / 1e3).toFixed(1) + " km";
            } else {
              boxReturnDist.style.display = "none";
            }
          }
          if (resEngine) {
            resEngine.textContent = result.isAIEngine ? "\u{1F916} 9Router AI" : "\u26A1 Thu\u1EADt to\xE1n Offline";
            resEngine.style.color = result.isAIEngine ? "#4f46e5" : "#059669";
          }
          if (expEl) {
            expEl.innerHTML = `<strong>Chi\u1EBFn l\u01B0\u1EE3c:</strong> ${escapeHtml(result.explanation || result.summary || "\u0110\xE3 s\u1EAFp x\u1EBFp l\u1ED9 tr\xECnh theo tr\xECnh t\u1EF1 di chuy\u1EC3n t\u1ED1i \u01B0u.")}`;
          }
          if (previewList) {
            previewList.innerHTML = "";
            if (result.depot) {
              const startRow = document.createElement("div");
              startRow.className = "ai-stop-row";
              startRow.style.background = "#f0fdf4";
              startRow.style.borderColor = "#bbf7d0";
              const startKm = result.startDistance != null && result.startDistance > 0 ? ` (+${(result.startDistance / 1e3).toFixed(1)} km)` : " (<50m)";
              startRow.innerHTML = `
              <span class="ai-stop-badge" style="background: #16a34a;">\u{1F3E2}</span>
              <div style="flex: 1; min-width: 0;">
                <strong style="color: #166534;">Xu\u1EA5t ph\xE1t: ${escapeHtml(result.depot.name)} \u279C \u0110i\u1EC3m #1</strong>
                <span style="color: #15803d; font-size: 11px; margin-left: 4px; font-weight: 600;">${startKm}</span>
                <div style="color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\u{1F4CD} ${escapeHtml(result.depot.address || "")}</div>
              </div>
              <span style="font-weight: 700; color: #16a34a; font-size: 11px;">G\u1EA7n nh\u1EA5t</span>
            `;
              previewList.appendChild(startRow);
            }
            result.orderedOrders.forEach((item, idx) => {
              const stopNum = idx + 1;
              const row = document.createElement("div");
              row.className = "ai-stop-row";
              row.innerHTML = `
              <span class="ai-stop-badge">#${stopNum}</span>
              <div style="flex: 1; min-width: 0;">
                <strong style="color: #0f172a;">${escapeHtml(item.customerName || "Kh\xE1ch l\u1EBB")}</strong>
                <span style="color: #64748b; font-size: 11px; margin-left: 4px;">(${escapeHtml(item.trackingCode || "")})</span>
                <div style="color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\u{1F4CD} ${escapeHtml(item.address || "Ch\u01B0a c\xF3 \u0111\u1ECBa ch\u1EC9")}</div>
              </div>
              <span style="font-weight: 700; color: #b45309; font-size: 11px;">${formatCurrency(item.codAmount || 0)}</span>
            `;
              previewList.appendChild(row);
            });
            if (result.returnToDepot && result.depot) {
              const retRow = document.createElement("div");
              retRow.className = "ai-stop-row";
              retRow.style.background = "#eff6ff";
              retRow.style.borderColor = "#bfdbfe";
              const retKm = result.returnDistance != null && result.returnDistance > 0 ? ` (+${(result.returnDistance / 1e3).toFixed(1)} km)` : " (<50m)";
              retRow.innerHTML = `
              <span class="ai-stop-badge" style="background: #2563eb;">\u{1F3C1}</span>
              <div style="flex: 1; min-width: 0;">
                <strong style="color: #1e40af;">\u0110i\u1EC3m #${result.orderedOrders.length} \u279C Quay v\u1EC1 ${escapeHtml(result.depot.name)}</strong>
                <span style="color: #2563eb; font-size: 11px; margin-left: 4px; font-weight: 600;">${retKm}</span>
                <div style="color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">\u{1F4CD} ${escapeHtml(result.depot.address || "")}</div>
              </div>
              <span style="font-weight: 700; color: #2563eb; font-size: 11px;">\u{1F504} Kh\xE9p k\xEDn</span>
            `;
              previewList.appendChild(retRow);
            }
          }
          showToast("\u0110\xE3 t\xEDnh to\xE1n xong l\u1ED9 tr\xECnh t\u1ED1i \u01B0u!", "success");
        } catch (err) {
          console.error("L\u1ED7i khi ch\u1EA1y t\u1ED1i \u01B0u h\xF3a AI:", err);
          showToast("L\u1ED7i khi t\u1ED1i \u01B0u: " + (err.message || err), "error");
        } finally {
          if (timer) clearInterval(timer);
          btnRun.disabled = false;
          if (runBtnText) runBtnText.textContent = "B\u1EAFt \u0110\u1EA7u AI T\u1ED1i \u01AFu L\u1ED9 Tr\xECnh (9Router)";
          if (runStatus) runStatus.style.display = "none";
        }
      });
    }
    if (btnApply) {
      btnApply.addEventListener("click", () => {
        if (!lastOptimizedResult || !lastOptimizedResult.orderedOrders) {
          showToast("Ch\u01B0a c\xF3 k\u1EBFt qu\u1EA3 t\u1ED1i \u01B0u \u0111\u1EC3 \xE1p d\u1EE5ng!", "warning");
          return;
        }
        const orderedPendingIds = lastOptimizedResult.orderedOrders.map((o) => o.id);
        const pendingMap = /* @__PURE__ */ new Map();
        lastOptimizedResult.orderedOrders.forEach((o) => pendingMap.set(o.id, o));
        const newOrders = [];
        const remainingOthers = [];
        currentOrders.forEach((o) => {
          if (pendingMap.has(o.id)) {
          } else {
            remainingOthers.push(o);
          }
        });
        orderedPendingIds.forEach((id) => {
          const found = currentOrders.find((o) => o.id === id);
          if (found) newOrders.push(found);
        });
        remainingOthers.forEach((o) => newOrders.push(o));
        currentOrders = newOrders;
        StorageService.saveOrders(currentOrders);
        const seenGroupIds = /* @__PURE__ */ new Set();
        const reorderedGroups = [];
        currentOrders.forEach((o) => {
          const gid = o.groupId || "group_ungrouped";
          if (!seenGroupIds.has(gid)) {
            seenGroupIds.add(gid);
            const gObj = currentGroups.find((g) => g.id === gid);
            if (gObj) reorderedGroups.push(gObj);
          }
        });
        currentGroups.forEach((g) => {
          if (!seenGroupIds.has(g.id)) {
            reorderedGroups.push(g);
          }
        });
        currentGroups = reorderedGroups;
        StorageService.saveGroups(currentGroups);
        renderApp();
        showToast("\u{1F389} \u0110\xE3 \xE1p d\u1EE5ng l\u1ED9 tr\xECnh t\u1ED1i \u01B0u AI v\xE0o h\u1EC7 th\u1ED1ng!", "success");
        closeModal();
      });
    }
    if (btnSync) {
      btnSync.addEventListener("click", () => {
        if (lastOptimizedResult && lastOptimizedResult.orderedOrders) {
          btnApply.click();
        }
        closeModal();
        const btnOpenQrSync = document.getElementById("btnOpenQrSyncModalDesktop");
        if (btnOpenQrSync) {
          btnOpenQrSync.click();
        }
      });
    }
    const btnScanMapDesktop = document.getElementById("btnScanMapOneWayDesktop");
    if (btnScanMapDesktop) {
      btnScanMapDesktop.addEventListener("click", async () => {
        const aiOpt = window.AIRouteOptimizer;
        if (!aiOpt || !aiOpt.scanAreaOneWayFromMap) return;
        btnScanMapDesktop.disabled = true;
        btnScanMapDesktop.textContent = "\u23F3 \u0110ang qu\xE9t...";
        const activeOrders = typeof getActiveTripOrders === "function" ? getActiveTripOrders() : currentOrders;
        const pending = activeOrders.filter((o) => o.status === "pending");
        const desktopBounds = typeof desktopMap !== "undefined" && desktopMap && desktopMap.getBounds ? {
          s: desktopMap.getBounds().getSouth(),
          w: desktopMap.getBounds().getWest(),
          n: desktopMap.getBounds().getNorth(),
          e: desktopMap.getBounds().getEast()
        } : null;
        try {
          const streets = await aiOpt.scanAreaOneWayFromMap(pending, desktopBounds);
          const noteEl = document.getElementById("aiOneWayMapNoteDesktop");
          if (noteEl) noteEl.textContent = `\u2713 \u0110\xE3 l\u1ECDc ${streets.length} tuy\u1EBFn \u0111\u01B0\u1EDDng 1 chi\u1EC1u t\u1EEB OpenStreetMap!`;
          showToast(`\u2713 \u0110\xE3 l\u1ECDc th\xE0nh c\xF4ng ${streets.length} tuy\u1EBFn \u0111\u01B0\u1EDDng 1 chi\u1EC1u t\u1EEB b\u1EA3n \u0111\u1ED3!`, "success");
        } catch (err) {
          showToast("Kh\xF4ng th\u1EC3 qu\xE9t d\u1EEF li\u1EC7u b\u1EA3n \u0111\u1ED3: " + (err.message || "L\u1ED7i k\u1EBFt n\u1ED1i"), "error");
        } finally {
          btnScanMapDesktop.disabled = false;
          btnScanMapDesktop.textContent = "\u{1F504} Qu\xE9t b\u1EA3n \u0111\u1ED3 (OSM)";
        }
      });
    }
  }
  function setupDesktopFleetDispatch() {
    const btnOpen = document.getElementById("btnOpenFleetDispatchDesktop");
    const modal = document.getElementById("modalFleetDispatch");
    const btnClose = document.getElementById("btnCloseFleetDispatchModal");
    if (!btnOpen || !modal) return;
    const countSelect = document.getElementById("fleetShipperCountSelect");
    const namesRow = document.getElementById("fleetShipperNamesRow");
    const depotNameEl = document.getElementById("fleetDepotName");
    const pendingCountEl = document.getElementById("fleetTotalPendingCount");
    const btnRun = document.getElementById("btnRunFleetPartition");
    const chkStrictOneWay = document.getElementById("chkFleetStrictOneWay");
    const chkReturnToDepot = document.getElementById("chkFleetReturnToDepot");
    const resultSection = document.getElementById("fleetResultSection");
    const summaryText = document.getElementById("fleetResultSummaryText");
    const btnSaveConfig = document.getElementById("btnSaveFleetConfig");
    const btnApplyToApp = document.getElementById("btnApplyFleetToApp");
    const routesGrid = document.getElementById("fleetRoutesGrid");
    const activeTitle = document.getElementById("fleetActiveRouteTitle");
    const activeStats = document.getElementById("fleetActiveRouteStats");
    const activeOrdersList = document.getElementById("fleetActiveOrdersList");
    const activeKmBadge = document.getElementById("fleetActiveRouteKmBadge");
    const mapContainer = document.getElementById("fleetMapContainer");
    const modalP2P = document.getElementById("modalFleetShipperP2P");
    const btnCloseP2P = document.getElementById("btnCloseFleetShipperP2P");
    const btnDoneP2P = document.getElementById("btnDoneFleetShipperP2P");
    const p2pTitle = document.getElementById("fleetP2PModalTitle");
    const p2pSummary = document.getElementById("fleetP2PRouteSummary");
    const p2pCanvas = document.getElementById("fleetP2PCanvasContainer");
    const p2pPin = document.getElementById("fleetP2PPinValue");
    const p2pStatus = document.getElementById("fleetP2PStatusMsg");
    let currentFleetResult = null;
    let activeRouteIndex = 0;
    let fleetMap = null;
    let fleetMapLayerGroup = null;
    let fleetP2PHost = null;
    function renderShipperNameInputs(count, existingNames) {
      if (!namesRow) return;
      namesRow.innerHTML = "";
      const colors = window.AIRouteOptimizer && window.AIRouteOptimizer.FLEET_DEFAULT_COLORS || ["#2563eb", "#ea580c", "#059669", "#7c3aed", "#dc2626", "#0891b2", "#db2777", "#d97706"];
      for (let i = 0; i < count; i++) {
        const col = colors[i % colors.length];
        const defaultName = existingNames && existingNames[i] || `Shipper ${i + 1}`;
        const wrap = document.createElement("div");
        wrap.style.cssText = "display: flex; align-items: center; gap: 5px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 3px 8px;";
        wrap.innerHTML = `
        <span style="width: 10px; height: 10px; border-radius: 50%; background: ${col}; display: inline-block;"></span>
        <input type="text" class="fleet-shipper-name-input" data-index="${i}" value="${escapeHtml(defaultName)}" style="border: none; background: transparent; font-size: 11.5px; font-weight: 600; color: #1e293b; width: 105px; outline: none;" placeholder="T\xEAn Shipper ${i + 1}">
      `;
        namesRow.appendChild(wrap);
      }
      namesRow.querySelectorAll(".fleet-shipper-name-input").forEach((inp) => {
        inp.addEventListener("input", (e) => {
          const idx = parseInt(e.target.dataset.index, 10);
          const newName = e.target.value.trim() || `Shipper ${idx + 1}`;
          if (currentFleetResult && currentFleetResult.routes && currentFleetResult.routes[idx]) {
            currentFleetResult.routes[idx].shipperName = newName;
            StorageService.saveFleetDispatch(currentFleetResult);
            renderFleetRouteCards();
            if (activeRouteIndex === idx) {
              updateActiveRouteHeader();
            }
          }
        });
      });
    }
    if (countSelect) {
      countSelect.addEventListener("change", () => {
        const c = parseInt(countSelect.value, 10) || 4;
        const existingNames = [];
        namesRow.querySelectorAll(".fleet-shipper-name-input").forEach((inp) => existingNames.push(inp.value.trim()));
        renderShipperNameInputs(c, existingNames);
      });
    }
    function openFleetModal() {
      const aiOpt = window.AIRouteOptimizer;
      const curDepot = aiOpt && aiOpt.getDepot ? aiOpt.getDepot() : { name: "B\u01B0u c\u1EE5c GHN Xu\xE2n H\xF2a" };
      if (depotNameEl) depotNameEl.textContent = curDepot.name;
      const activeOrders = typeof getActiveTripOrders === "function" ? getActiveTripOrders() : currentOrders;
      const pending = activeOrders.filter((o) => o.status === "pending");
      if (pendingCountEl) pendingCountEl.textContent = pending.length;
      const savedDispatch = StorageService.getFleetDispatch ? StorageService.getFleetDispatch() : null;
      if (savedDispatch && savedDispatch.routes && savedDispatch.routes.length > 0) {
        currentFleetResult = savedDispatch;
        if (countSelect) countSelect.value = String(savedDispatch.routes.length);
        const savedNames = savedDispatch.routes.map((r) => r.shipperName);
        renderShipperNameInputs(savedDispatch.routes.length, savedNames);
        if (summaryText) {
          const timeStr = savedDispatch.timestamp ? new Date(savedDispatch.timestamp).toLocaleTimeString("vi-VN") + " " + new Date(savedDispatch.timestamp).toLocaleDateString("vi-VN") : "";
          summaryText.innerHTML = `\u{1F4BE} C\u1EA5u h\xECnh \u0111\xE3 l\u01B0u (${timeStr}) \u2022 <strong style="color: #059669;">${savedDispatch.routes.length} tuy\u1EBFn</strong> (${savedDispatch.totalOrders || 0} \u0111\u01A1n)`;
        }
        if (resultSection) resultSection.style.display = "flex";
        activeRouteIndex = 0;
        renderFleetRouteCards();
        renderFleetActiveRouteOrders();
        setTimeout(initOrUpdateFleetMap, 200);
      } else {
        const initialCount = countSelect ? parseInt(countSelect.value, 10) : 4;
        renderShipperNameInputs(initialCount);
        if (resultSection) resultSection.style.display = "none";
        currentFleetResult = null;
      }
      modal.style.display = "flex";
      setTimeout(() => {
        if (fleetMap) fleetMap.invalidateSize();
      }, 250);
    }
    function closeFleetModal() {
      modal.style.display = "none";
    }
    btnOpen.addEventListener("click", openFleetModal);
    if (btnClose) btnClose.addEventListener("click", closeFleetModal);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeFleetModal();
    });
    if (btnRun) {
      btnRun.addEventListener("click", async () => {
        const aiOpt = window.AIRouteOptimizer;
        if (!aiOpt || !aiOpt.partitionFleetRoutes) {
          showToast("Module AI Fleet Partition ch\u01B0a s\u1EB5n s\xE0ng!", "error");
          return;
        }
        const activeOrders = typeof getActiveTripOrders === "function" ? getActiveTripOrders() : currentOrders;
        const pending = activeOrders.filter((o) => o.status === "pending");
        if (pending.length === 0) {
          showToast("Kh\xF4ng c\xF3 \u0111\u01A1n h\xE0ng Ch\u1EDD Giao n\xE0o \u0111\u1EC3 ph\xE2n tuy\u1EBFn!", "warning");
          return;
        }
        const numShippers = parseInt(countSelect.value, 10) || 4;
        const nameInputs = namesRow.querySelectorAll(".fleet-shipper-name-input");
        const shippers = [];
        const colors = aiOpt.FLEET_DEFAULT_COLORS || ["#2563eb", "#ea580c", "#059669", "#7c3aed", "#dc2626", "#0891b2", "#db2777", "#d97706"];
        for (let i = 0; i < numShippers; i++) {
          const n = nameInputs[i] && nameInputs[i].value.trim() || `Shipper ${i + 1}`;
          shippers.push({ name: n, color: colors[i % colors.length] });
        }
        btnRun.disabled = true;
        btnRun.innerHTML = "<span>\u23F3 \u0110ang ph\xE2n chia tuy\u1EBFn...</span>";
        try {
          const strictOneWay = chkStrictOneWay ? chkStrictOneWay.checked : true;
          const returnToDepot = chkReturnToDepot ? chkReturnToDepot.checked : true;
          const depot = aiOpt.getDepot ? aiOpt.getDepot() : null;
          const res = await aiOpt.partitionFleetRoutes(pending, { numShippers, shippers }, {
            strictOneWay,
            returnToDepot,
            depot
          });
          currentFleetResult = res;
          activeRouteIndex = 0;
          StorageService.saveFleetDispatch(currentFleetResult);
          if (summaryText) {
            summaryText.innerHTML = `\u{1F389} \u0110\xE3 ph\xE2n chia t\u1ED1i \u01B0u <strong style="color: #059669;">${res.routes.length} tuy\u1EBFn</strong> (${res.totalOrders} \u0111\u01A1n) cho ${res.numShippers} Shipper`;
          }
          if (resultSection) resultSection.style.display = "flex";
          renderFleetRouteCards();
          renderFleetActiveRouteOrders();
          setTimeout(initOrUpdateFleetMap, 200);
          showToast(`\u{1F389} AI \u0111\xE3 ph\xE2n chia th\xE0nh c\xF4ng ${res.routes.length} tuy\u1EBFn v\xE0 t\u1EF1 \u0111\u1ED9ng l\u01B0u c\u1EA5u h\xECnh!`, "success");
        } catch (err) {
          console.error("L\u1ED7i khi ph\xE2n tuy\u1EBFn AI:", err);
          showToast("L\u1ED7i khi ph\xE2n tuy\u1EBFn: " + (err.message || err), "error");
        } finally {
          btnRun.disabled = false;
          btnRun.innerHTML = "<span>\u{1F680} B\u1EAFt \u0110\u1EA7u Chia Tuy\u1EBFn</span>";
        }
      });
    }
    if (btnSaveConfig) {
      btnSaveConfig.addEventListener("click", () => {
        if (!currentFleetResult) {
          showToast("Ch\u01B0a c\xF3 d\u1EEF li\u1EC7u ph\xE2n tuy\u1EBFn \u0111\u1EC3 l\u01B0u!", "warning");
          return;
        }
        currentFleetResult.timestamp = Date.now();
        StorageService.saveFleetDispatch(currentFleetResult);
        if (summaryText) {
          const timeStr = new Date(currentFleetResult.timestamp).toLocaleTimeString("vi-VN") + " " + new Date(currentFleetResult.timestamp).toLocaleDateString("vi-VN");
          summaryText.innerHTML = `\u{1F4BE} C\u1EA5u h\xECnh \u0111\xE3 l\u01B0u (${timeStr}) \u2022 <strong style="color: #059669;">${currentFleetResult.routes.length} tuy\u1EBFn</strong> (${currentFleetResult.totalOrders || 0} \u0111\u01A1n)`;
        }
        showToast("\u{1F4BE} \u0110\xE3 l\u01B0u c\u1EA5u h\xECnh ph\xE2n tuy\u1EBFn th\xE0nh c\xF4ng!", "success");
      });
    }
    if (btnApplyToApp) {
      btnApplyToApp.addEventListener("click", () => {
        if (!currentFleetResult || !currentFleetResult.routes || currentFleetResult.routes.length === 0) {
          showToast("Ch\u01B0a c\xF3 d\u1EEF li\u1EC7u ph\xE2n tuy\u1EBFn!", "warning");
          return;
        }
        if (!confirm(`B\u1EA1n c\xF3 ch\u1EAFc mu\u1ED1n \xE1p d\u1EE5ng ${currentFleetResult.routes.length} tuy\u1EBFn n\xE0y th\xE0nh c\xE1c nh\xF3m giao h\xE0ng tr\xEAn Desktop?`)) {
          return;
        }
        const newGroups = [];
        const routeGroupMap = {};
        currentFleetResult.routes.forEach((r, idx) => {
          const gId = "group_fleet_" + (idx + 1);
          routeGroupMap[r.id] = gId;
          newGroups.push({
            id: gId,
            name: r.shipperName,
            color: r.color,
            createdAt: Date.now() + idx
          });
        });
        const newOrders = [];
        const assignedIds = /* @__PURE__ */ new Set();
        currentFleetResult.routes.forEach((r) => {
          const targetGid = routeGroupMap[r.id];
          r.orderedOrders.forEach((o) => {
            const orig = currentOrders.find((item) => item.id === o.id);
            if (orig) {
              orig.groupId = targetGid;
              newOrders.push(orig);
              assignedIds.add(orig.id);
            }
          });
        });
        currentOrders.forEach((o) => {
          if (!assignedIds.has(o.id)) {
            newOrders.push(o);
          }
        });
        currentOrders = newOrders;
        currentGroups = newGroups;
        StorageService.saveOrders(currentOrders);
        StorageService.saveGroups(currentGroups);
        renderApp();
        showToast(`\u{1F389} \u0110\xE3 \xE1p d\u1EE5ng ph\xE2n tuy\u1EBFn th\xE0nh ${newGroups.length} nh\xF3m giao h\xE0ng tr\xEAn Desktop!`, "success");
        closeFleetModal();
      });
    }
    function renderFleetRouteCards() {
      if (!routesGrid || !currentFleetResult || !currentFleetResult.routes) return;
      routesGrid.innerHTML = "";
      currentFleetResult.routes.forEach((r, idx) => {
        const card = document.createElement("div");
        card.className = `fleet-route-card ${idx === activeRouteIndex ? "selected" : ""}`;
        card.style.setProperty("--route-color", r.color);
        const streetsStr = r.primaryStreets && r.primaryStreets.length > 0 ? r.primaryStreets.slice(0, 2).join(", ") + (r.primaryStreets.length > 2 ? ` (+${r.primaryStreets.length - 2} \u0111\u01B0\u1EDDng)` : "") : "\u0110a \u0111i\u1EC3m";
        const kmStr = r.totalDistance ? `~${(r.totalDistance / 1e3).toFixed(1)} km` : "~5 km";
        card.innerHTML = `
        <div class="fleet-route-card-header">
          <div class="fleet-route-name">
            <span class="fleet-color-indicator" style="background: ${r.color};"></span>
            <span>${escapeHtml(r.shipperName)}</span>
          </div>
          <span style="font-size: 11px; font-weight: 700; color: ${r.color};">Tuy\u1EBFn ${idx + 1}</span>
        </div>
        <div class="fleet-stats-row">
          <span class="fleet-stat-pill">\u{1F4E6} ${r.orderedOrders ? r.orderedOrders.length : r.orderCount} \u0111\u01A1n</span>
          <span class="fleet-stat-pill" style="color: #b45309;">\u{1F4B0} ${formatCurrency(r.totalCod || 0)}</span>
          <span class="fleet-stat-pill" style="color: #0284c7;">\u{1F4CD} ${kmStr}</span>
        </div>
        <div style="font-size: 11px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml((r.primaryStreets || []).join(", "))}">
          Tr\u1EE5c ch\xEDnh: <strong>${escapeHtml(streetsStr)}</strong>
        </div>
        <div style="display: flex; gap: 6px; margin-top: 4px;">
          <button type="button" class="btn btn-sm btn-outline-primary fleet-btn-dispatch" data-route-index="${idx}" style="flex: 1; font-size: 11px; padding: 4px 6px; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1d4ed8; font-weight: 700; cursor: pointer;" title="B\u1EAFn to\xE0n b\u1ED9 \u0111\u01A1n tuy\u1EBFn n\xE0y sang \u0111i\u1EC7n tho\u1EA1i c\u1EE7a ${escapeHtml(r.shipperName)} qua QR ho\u1EB7c m\xE3 PIN">
            \u{1F4F1} B\u1EAFn Chuy\u1EBFn
          </button>
          <button type="button" class="btn btn-sm btn-secondary fleet-btn-select-route" data-route-index="${idx}" style="font-size: 11px; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; background: #ffffff; color: #475569; font-weight: 600; cursor: pointer;">
            \u{1F441}\uFE0F Xem
          </button>
        </div>
      `;
        card.addEventListener("click", (e) => {
          if (e.target.closest(".fleet-btn-dispatch")) return;
          activeRouteIndex = idx;
          renderFleetRouteCards();
          renderFleetActiveRouteOrders();
          updateActiveRouteHeader();
          updateFleetMap();
        });
        routesGrid.appendChild(card);
      });
      routesGrid.querySelectorAll(".fleet-btn-dispatch").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const rIdx = parseInt(btn.dataset.routeIndex, 10);
          openSingleShipperP2P(rIdx);
        });
      });
    }
    function updateActiveRouteHeader() {
      if (!currentFleetResult || !currentFleetResult.routes) return;
      const r = currentFleetResult.routes[activeRouteIndex];
      if (!r) return;
      if (activeTitle) {
        activeTitle.innerHTML = `
        <span class="fleet-color-indicator" style="background: ${r.color};"></span>
        <span>Chi ti\u1EBFt \u0111\u01A1n h\xE0ng: ${escapeHtml(r.shipperName)} (Tuy\u1EBFn ${activeRouteIndex + 1})</span>
      `;
      }
      const oCount = r.orderedOrders ? r.orderedOrders.length : 0;
      const codSum = r.orderedOrders ? r.orderedOrders.reduce((s, o) => s + (o.codAmount || 0), 0) : 0;
      if (activeStats) {
        activeStats.textContent = `${oCount} \u0111\u01A1n \u2022 ${formatCurrency(codSum)} COD`;
      }
      if (activeKmBadge) {
        activeKmBadge.textContent = r.totalDistance ? `~${(r.totalDistance / 1e3).toFixed(1)} km` : "~5 km";
      }
    }
    function renderFleetActiveRouteOrders() {
      if (!activeOrdersList || !currentFleetResult || !currentFleetResult.routes) return;
      const r = currentFleetResult.routes[activeRouteIndex];
      if (!r) return;
      updateActiveRouteHeader();
      activeOrdersList.innerHTML = "";
      const orders = r.orderedOrders || [];
      if (orders.length === 0) {
        activeOrdersList.innerHTML = '<div style="padding: 20px; text-align: center; color: #94a3b8; font-size: 12px;">Tuy\u1EBFn n\xE0y hi\u1EC7n ch\u01B0a c\xF3 \u0111\u01A1n h\xE0ng n\xE0o.</div>';
        return;
      }
      orders.forEach((o, idx) => {
        const row = document.createElement("div");
        row.className = "fleet-order-row";
        row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">
          <span style="font-weight: 800; color: ${r.color}; font-size: 11px; min-width: 22px;">#${idx + 1}</span>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; gap: 6px; align-items: center;">
              <strong style="color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 140px;">${escapeHtml(o.customerName || "Kh\xE1ch l\u1EBB")}</strong>
              <span style="font-size: 10.5px; color: #64748b;">${escapeHtml(o.trackingCode || "")}</span>
            </div>
            <div style="color: #475569; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(o.address || "")}">
              \u{1F4CD} ${escapeHtml(o.address || "Ch\u01B0a c\xF3 \u0111\u1ECBa ch\u1EC9")}
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0; margin-left: 8px;">
          <span style="font-weight: 700; color: #b45309; font-size: 11px;">${formatCurrency(o.codAmount || 0)}</span>
          <div class="fleet-transfer-wrap" style="position: relative;">
            <button type="button" class="fleet-btn-transfer" data-order-id="${o.id}" title="Chuy\u1EC3n \u0111\u01A1n n\xE0y sang Shipper kh\xE1c">
              <span>\u{1F504} Chuy\u1EC3n tuy\u1EBFn</span>
            </button>
          </div>
        </div>
      `;
        const btnTr = row.querySelector(".fleet-btn-transfer");
        if (btnTr) {
          btnTr.addEventListener("click", (e) => {
            e.stopPropagation();
            showTransferMenu(btnTr, o.id);
          });
        }
        activeOrdersList.appendChild(row);
      });
    }
    function showTransferMenu(btnEl, orderId) {
      document.querySelectorAll(".fleet-transfer-dropdown").forEach((d) => d.remove());
      const menu = document.createElement("div");
      menu.className = "fleet-transfer-dropdown";
      menu.style.cssText = "position: absolute; right: 0; top: 100%; z-index: 1000; background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); padding: 4px; min-width: 180px; display: flex; flex-direction: column; gap: 2px;";
      const header = document.createElement("div");
      header.style.cssText = "font-size: 10.5px; font-weight: 700; color: #64748b; padding: 4px 8px; border-bottom: 1px solid #f1f5f9;";
      header.textContent = "Chuy\u1EC3n \u0111\u01A1n sang Shipper:";
      menu.appendChild(header);
      currentFleetResult.routes.forEach((targetRoute, tIdx) => {
        if (tIdx === activeRouteIndex) return;
        const opt = document.createElement("button");
        opt.type = "button";
        opt.style.cssText = "display: flex; align-items: center; justify-content: space-between; border: none; background: transparent; padding: 6px 8px; border-radius: 5px; font-size: 11.5px; cursor: pointer; text-align: left; transition: background 0.15s; width: 100%;";
        opt.innerHTML = `
        <span style="display: flex; align-items: center; gap: 6px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: ${targetRoute.color};"></span>
          <strong style="color: #1e293b;">${escapeHtml(targetRoute.shipperName)}</strong>
        </span>
        <span style="font-size: 10.5px; color: #64748b;">${targetRoute.orderedOrders ? targetRoute.orderedOrders.length : 0} \u0111\u01A1n</span>
      `;
        opt.addEventListener("mouseenter", () => {
          opt.style.background = "#f1f5f9";
        });
        opt.addEventListener("mouseleave", () => {
          opt.style.background = "transparent";
        });
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          menu.remove();
          executeOrderTransfer(orderId, activeRouteIndex, tIdx);
        });
        menu.appendChild(opt);
      });
      btnEl.parentElement.appendChild(menu);
      const closeHandler = (e) => {
        if (!menu.contains(e.target) && e.target !== btnEl) {
          menu.remove();
          window.removeEventListener("click", closeHandler);
        }
      };
      setTimeout(() => {
        window.addEventListener("click", closeHandler);
      }, 50);
    }
    function executeOrderTransfer(orderId, fromIdx, toIdx) {
      if (!currentFleetResult || !currentFleetResult.routes) return;
      const fromRoute = currentFleetResult.routes[fromIdx];
      const toRoute = currentFleetResult.routes[toIdx];
      if (!fromRoute || !toRoute) return;
      const oIdx = fromRoute.orderedOrders.findIndex((o) => o.id === orderId);
      if (oIdx === -1) return;
      const [transferredOrder] = fromRoute.orderedOrders.splice(oIdx, 1);
      toRoute.orderedOrders.push(transferredOrder);
      fromRoute.orderCount = fromRoute.orderedOrders.length;
      fromRoute.totalCod = fromRoute.orderedOrders.reduce((s, o) => s + (o.codAmount || 0), 0);
      toRoute.orderCount = toRoute.orderedOrders.length;
      toRoute.totalCod = toRoute.orderedOrders.reduce((s, o) => s + (o.codAmount || 0), 0);
      currentFleetResult.timestamp = Date.now();
      StorageService.saveFleetDispatch(currentFleetResult);
      renderFleetRouteCards();
      renderFleetActiveRouteOrders();
      updateFleetMap();
      showToast(`\u2713 \u0110\xE3 chuy\u1EC3n \u0111\u01A1n sang ${toRoute.shipperName} v\xE0 t\u1EF1 \u0111\u1ED9ng l\u01B0u c\u1EA5u h\xECnh!`, "success");
    }
    function initOrUpdateFleetMap() {
      if (!mapContainer || typeof L === "undefined") return;
      if (!fleetMap) {
        fleetMap = L.map("fleetMapContainer", {
          zoomControl: true,
          attributionControl: false
        }).setView([21.2965, 105.741], 14);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19
        }).addTo(fleetMap);
        fleetMapLayerGroup = L.layerGroup().addTo(fleetMap);
      } else {
        fleetMap.invalidateSize();
      }
      updateFleetMap();
    }
    function updateFleetMap() {
      if (!fleetMap || !fleetMapLayerGroup || !currentFleetResult || !currentFleetResult.routes) return;
      fleetMapLayerGroup.clearLayers();
      const bounds = L.latLngBounds();
      const depot = currentFleetResult.depot || (window.AIRouteOptimizer && window.AIRouteOptimizer.getDepot ? window.AIRouteOptimizer.getDepot() : null);
      if (depot && depot.lat != null && depot.lng != null) {
        const depotLatLng = [depot.lat, depot.lng];
        bounds.extend(depotLatLng);
        const depotIcon = L.divIcon({
          className: "fleet-depot-marker",
          html: `<div style="background: #16a34a; color: #fff; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 16px; border: 2.5px solid #fff; box-shadow: 0 4px 10px rgba(0,0,0,0.35);">\u{1F3E2}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15]
        });
        L.marker(depotLatLng, { icon: depotIcon }).bindPopup(`<strong>\u{1F3E2} ${escapeHtml(depot.name || "B\u01B0u c\u1EE5c")}</strong><br><span style="font-size:11px; color:#64748b;">${escapeHtml(depot.address || "")}</span>`).addTo(fleetMapLayerGroup);
      }
      currentFleetResult.routes.forEach((r, rIdx) => {
        const isSelected = rIdx === activeRouteIndex;
        const orders = r.orderedOrders || [];
        const routePoints = [];
        if (depot && depot.lat != null && depot.lng != null) {
          routePoints.push([depot.lat, depot.lng]);
        }
        orders.forEach((o, oIdx) => {
          if (o.lat != null && o.lng != null) {
            const latLng = [o.lat, o.lng];
            routePoints.push(latLng);
            bounds.extend(latLng);
            const dotIcon = L.divIcon({
              className: "fleet-order-marker",
              html: `<div style="background: ${r.color}; color: #fff; width: ${isSelected ? "22px" : "16px"}; height: ${isSelected ? "22px" : "16px"}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: ${isSelected ? "10px" : "8px"}; font-weight: 800; border: 2px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.25); opacity: ${isSelected ? "1" : "0.65"};">
                    ${isSelected ? oIdx + 1 : ""}
                   </div>`,
              iconSize: isSelected ? [22, 22] : [16, 16],
              iconAnchor: isSelected ? [11, 11] : [8, 8]
            });
            const marker = L.marker(latLng, { icon: dotIcon });
            marker.bindPopup(`
            <div style="font-size: 12px; line-height: 1.4;">
              <strong style="color: ${r.color};">Tuy\u1EBFn ${rIdx + 1}: ${escapeHtml(r.shipperName)} (#${oIdx + 1})</strong><br>
              <strong>${escapeHtml(o.customerName || "Kh\xE1ch l\u1EBB")}</strong> (${escapeHtml(o.trackingCode || "")})<br>
              <span style="color: #64748b;">\u{1F4CD} ${escapeHtml(o.address || "")}</span><br>
              <span style="color: #b45309; font-weight: 700;">COD: ${formatCurrency(o.codAmount || 0)}</span>
            </div>
          `);
            marker.addTo(fleetMapLayerGroup);
          }
        });
        if (isSelected && routePoints.length > 1) {
          if (depot && depot.lat != null && depot.lng != null) {
            routePoints.push([depot.lat, depot.lng]);
          }
          L.polyline(routePoints, {
            color: r.color,
            weight: 4,
            opacity: 0.85,
            dashArray: "4, 4"
          }).addTo(fleetMapLayerGroup);
        }
      });
      if (bounds.isValid()) {
        fleetMap.fitBounds(bounds, { padding: [25, 25] });
      }
    }
    function openSingleShipperP2P(rIdx) {
      if (!currentFleetResult || !currentFleetResult.routes) return;
      const r = currentFleetResult.routes[rIdx];
      if (!r) return;
      const p2pSync = window.P2PSync || (typeof P2PSync !== "undefined" ? P2PSync : null);
      if (!p2pSync) {
        showToast("Module P2PSync ch\u01B0a s\u1EB5n s\xE0ng!", "error");
        return;
      }
      if (modalP2P) modalP2P.style.display = "flex";
      if (p2pTitle) p2pTitle.innerHTML = `<span>\u{1F4F1}</span> B\u1EAFn Chuy\u1EBFn Cho ${escapeHtml(r.shipperName)} (Tuy\u1EBFn ${rIdx + 1})`;
      const count = r.orderedOrders ? r.orderedOrders.length : 0;
      const codSum = r.orderedOrders ? r.orderedOrders.reduce((s, o) => s + (o.codAmount || 0), 0) : 0;
      const kmStr = r.totalDistance ? `~${(r.totalDistance / 1e3).toFixed(1)} km` : "~5 km";
      if (p2pSummary) {
        p2pSummary.innerHTML = `<strong>${count} \u0111\u01A1n h\xE0ng</strong> \u2022 <strong style="color: #b45309;">${formatCurrency(codSum)} COD</strong> \u2022 <span>${kmStr}</span>`;
      }
      if (p2pStatus) {
        p2pStatus.innerHTML = "\u23F3 \u0110ang kh\u1EDFi t\u1EA1o ph\xF2ng ch\u1EDD Shipper...";
        p2pStatus.style.color = "#059669";
        p2pStatus.style.background = "#f0fdf4";
        p2pStatus.style.borderColor = "#bbf7d0";
      }
      if (p2pPin) p2pPin.textContent = "------";
      if (fleetP2PHost) {
        try {
          fleetP2PHost.destroy();
        } catch (e) {
        }
        fleetP2PHost = null;
      }
      const shipperOrders = (r.orderedOrders || []).map((o) => ({
        ...o,
        groupId: "group_fleet_" + r.id
      }));
      const shipperGroups = [{
        id: "group_fleet_" + r.id,
        name: r.shipperName,
        color: r.color,
        createdAt: Date.now()
      }];
      fleetP2PHost = p2pSync.createHost({
        onReady: (roomInfo) => {
          if (p2pPin) p2pPin.textContent = roomInfo.pin;
          if (p2pStatus) {
            p2pStatus.innerHTML = `\u23F3 Ph\xF2ng ch\u1EDD PIN: <strong>${roomInfo.pin}</strong>. \u0110ang \u0111\u1EE3i <strong>${escapeHtml(r.shipperName)}</strong> qu\xE9t m\xE3...`;
          }
          if (p2pCanvas) {
            p2pSync.renderP2PQR(p2pCanvas, roomInfo.qrToken, { cellSize: 5, margin: 2 });
          }
        },
        onConnecting: () => {
          if (p2pStatus) {
            p2pStatus.innerHTML = `\u26A1 ${escapeHtml(r.shipperName)} \u0111ang k\u1EBFt n\u1ED1i...`;
            p2pStatus.style.color = "#d97706";
          }
        },
        onConnected: () => {
          if (p2pStatus) {
            p2pStatus.innerHTML = `\u{1F680} \u0110\xE3 k\u1EBFt n\u1ED1i! \u0110ang b\u1EAFn ${shipperOrders.length} \u0111\u01A1n sang \u0111i\u1EC7n tho\u1EA1i...`;
          }
          const payload = p2pSync.buildPatchPayload(shipperOrders, shipperGroups, null);
          fleetP2PHost.send(payload);
        },
        onSent: () => {
          if (p2pStatus) {
            p2pStatus.innerHTML = `\u2705 \u0110\xC3 B\u1EAEN XONG ${shipperOrders.length} \u0110\u01A0N CHO ${escapeHtml(r.shipperName)}! (0.05s)`;
            p2pStatus.style.color = "#16a34a";
            p2pStatus.style.background = "#f0fdf4";
          }
          showToast(`\u26A1 \u0110\xE3 g\u1EEDi to\xE0n b\u1ED9 chuy\u1EBFn cho ${r.shipperName} th\xE0nh c\xF4ng!`, "success");
        },
        onError: (err) => {
          if (p2pStatus) {
            p2pStatus.innerHTML = `\u26A0\uFE0F L\u1ED7i P2P: ${err.message || err}`;
            p2pStatus.style.color = "#dc2626";
            p2pStatus.style.background = "#fef2f2";
          }
        }
      });
    }
    function closeSingleShipperP2P() {
      if (modalP2P) modalP2P.style.display = "none";
      if (fleetP2PHost) {
        try {
          fleetP2PHost.destroy();
        } catch (e) {
        }
        fleetP2PHost = null;
      }
    }
    if (btnCloseP2P) btnCloseP2P.addEventListener("click", closeSingleShipperP2P);
    if (btnDoneP2P) btnDoneP2P.addEventListener("click", closeSingleShipperP2P);
    if (modalP2P) {
      modalP2P.addEventListener("click", (e) => {
        if (e.target === modalP2P) closeSingleShipperP2P();
      });
    }
  }
})();
