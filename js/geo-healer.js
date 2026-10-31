/**
 * geo-healer.js - Module Chuẩn Hóa Địa Chỉ Đa Tầng & Tự Động Nắn Sửa Tọa Độ GHN
 * Giải quyết các trường hợp:
 * 1. Khách để tên khác nhau nhưng cùng một địa chỉ/tòa nhà (gom qua locationFingerprint)
 * 2. Địa chỉ có chứa thêm SĐT, giờ giấc, ghi chú người nhận
 * 3. Địa chỉ có tên Tòa nhà / Chung cư (khớp Landmark POI để lấy tọa độ chuẩn 100%)
 * 4. Tên con đường viết trước, số nhà viết sau (đảo ngược về chuẩn [Số nhà] [Tên đường])
 * 5. Chỉ có tên đường/phường/quận (thiếu số nhà - neo tim đường & gắn cờ cảnh báo)
 * 6. Thuật toán phát hiện tọa độ lệch xa (Outlier) & Tự động nắn sửa (Peer-snapping, nội suy)
 */

import { removeDiacritics, extractPhone, normalizeAddress, extractClusterName } from './parser.js';

// -------------------------------------------------------------------
// 1. TỪ ĐIỂN LANDMARK POI (TÒA NHÀ / CHUNG CƯ / TTTM ĐÃ XÁC THỰC GPS 100%)
// -------------------------------------------------------------------
export const VERIFIED_LANDMARKS = [
  {
    key: 'centec_tower',
    names: ['centec tower', 'centec', 'tòa nhà centec', 'toà centec', '72 74 nguyen thi minh khai'],
    street: 'Nguyễn Thị Minh Khai',
    houseNumber: '72-74',
    ward: 'Phường Võ Thị Sáu',
    district: 'Quận 3',
    lat: 10.781827,
    lng: 106.694695
  },
  {
    key: 'diamond_plaza',
    names: ['diamond plaza', 'diamond', 'tòa nhà diamond'],
    street: 'Lê Duẩn',
    houseNumber: '34',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    lat: 10.780721,
    lng: 106.698755
  },
  {
    key: 'vincom_dong_khoi',
    names: ['vincom đồng khởi', 'vincom center đồng khởi', 'vincom center', 'vincom dong khoi'],
    street: 'Đồng Khởi',
    houseNumber: '72',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    lat: 10.778002,
    lng: 106.702008
  },
  {
    key: 'bitexco',
    names: ['bitexco', 'bitexco financial tower', 'tháp tài chính bitexco'],
    street: 'Hải Triều',
    houseNumber: '2',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    lat: 10.771661,
    lng: 106.704439
  },
  {
    key: 'saigon_centre',
    names: ['saigon centre', 'takashimaya', 'saigon center'],
    street: 'Lê Lợi',
    houseNumber: '65',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    lat: 10.773356,
    lng: 106.701026
  },
  {
    key: 'hado_centrosa',
    names: ['hà đô centrosa', 'hado centrosa', 'chung cư hà đô', 'hà đô 3/2', 'hado centrosa garden'],
    street: '3 Tháng 2',
    houseNumber: '200',
    ward: 'Phường 12',
    district: 'Quận 10',
    lat: 10.774902,
    lng: 106.674932
  },
  {
    key: 'viettel_complex',
    names: ['viettel complex', 'tòa nhà viettel', 'viettel 285 cách mạng tháng 8', 'viettel cmt8'],
    street: 'Cách Mạng Tháng 8',
    houseNumber: '285',
    ward: 'Phường 12',
    district: 'Quận 10',
    lat: 10.778644,
    lng: 106.678036
  },
  {
    key: 'landmark_81',
    names: ['landmark 81', 'vinhome central park landmark 81', 'l81'],
    street: 'Nguyễn Hữu Cảnh',
    houseNumber: '720A',
    ward: 'Phường 22',
    district: 'Bình Thạnh',
    lat: 10.795116,
    lng: 106.721832
  },
  {
    key: 'm_plaza',
    names: ['mplaza', 'm plaza', 'kumho asiana', 'kumho'],
    street: 'Lê Duẩn',
    houseNumber: '39',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    lat: 10.783103,
    lng: 106.700142
  },
  {
    key: 'lim_tower_1',
    names: ['lim tower', 'lim tower 1', 'tòa nhà lim'],
    street: 'Lê Thánh Tôn',
    houseNumber: '9-11',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    lat: 10.780132,
    lng: 106.705191
  },
  {
    key: 'lim_tower_2',
    names: ['lim tower 2', 'lim 2'],
    street: 'Cách Mạng Tháng 8',
    houseNumber: '158',
    ward: 'Phường Võ Thị Sáu',
    district: 'Quận 3',
    lat: 10.774351,
    lng: 106.687612
  },
  {
    key: 'times_square',
    names: ['times square', 'reverie saigon'],
    street: 'Nguyễn Huệ',
    houseNumber: '22-36',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    lat: 10.773822,
    lng: 106.704289
  },
  {
    key: 'sunwah_tower',
    names: ['sunwah tower', 'sunwah'],
    street: 'Nguyễn Huệ',
    houseNumber: '115',
    ward: 'Phường Bến Nghé',
    district: 'Quận 1',
    lat: 10.773121,
    lng: 106.703212
  }
];

// -------------------------------------------------------------------
// -------------------------------------------------------------------
// 1.1 TỌA ĐỘ TRUNG TÂM VÀ BÁN KÍNH QUẬN/HUYỆN (CROSS-VALIDATION)
// -------------------------------------------------------------------
export const DISTRICT_CENTERS = {
  'q1': { name: 'Quận 1', lat: 10.7760, lng: 106.7000, radius: 4200 },
  'q3': { name: 'Quận 3', lat: 10.7818, lng: 106.6850, radius: 3600 },
  'q4': { name: 'Quận 4', lat: 10.7600, lng: 106.7050, radius: 3600 },
  'q5': { name: 'Quận 5', lat: 10.7540, lng: 106.6660, radius: 3800 },
  'q6': { name: 'Quận 6', lat: 10.7480, lng: 106.6350, radius: 4500 },
  'q7': { name: 'Quận 7', lat: 10.7350, lng: 106.7200, radius: 6500 },
  'q8': { name: 'Quận 8', lat: 10.7250, lng: 106.6500, radius: 6800 },
  'q10': { name: 'Quận 10', lat: 10.7720, lng: 106.6660, radius: 3800 },
  'q11': { name: 'Quận 11', lat: 10.7650, lng: 106.6500, radius: 4000 },
  'q12': { name: 'Quận 12', lat: 10.8650, lng: 106.6450, radius: 8500 },
  'binhthanh': { name: 'Bình Thạnh', lat: 10.8050, lng: 106.7100, radius: 5500 },
  'phunhuan': { name: 'Phú Nhuận', lat: 10.7980, lng: 106.6800, radius: 3600 },
  'tanbinh': { name: 'Tân Bình', lat: 10.8000, lng: 106.6550, radius: 5200 },
  'tanphu': { name: 'Tân Phú', lat: 10.7900, lng: 106.6250, radius: 5500 },
  'govap': { name: 'Gò Vấp', lat: 10.8400, lng: 106.6650, radius: 5800 },
  'binhtan': { name: 'Bình Tân', lat: 10.7650, lng: 106.5950, radius: 7500 },
  'thuduc': { name: 'Thủ Đức', lat: 10.8500, lng: 106.7700, radius: 12000 }
};

// -------------------------------------------------------------------
// 2. TÍNH KHOẢNG CÁCH HAVERSINE GIỮA 2 TỌA ĐỘ (MÉT)
// -------------------------------------------------------------------
export function getCoordDistanceMeters(lat1, lng1, lat2, lng2) {
  if (!isValidCoord(lat1, lng1) || !isValidCoord(lat2, lng2)) return 999999;
  const R = 6371000; // bán kính Trái Đất (mét)
  const dLat = (Number(lat2) - Number(lat1)) * Math.PI / 180;
  const dLng = (Number(lng2) - Number(lng1)) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(Number(lat1) * Math.PI / 180) * Math.cos(Number(lat2) * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
export function isValidCoord(lat, lng) {
  if (lat == null || lng == null) return false;
  const nLat = Number(lat);
  const nLng = Number(lng);
  return !isNaN(nLat) && !isNaN(nLng) && nLat > 8.0 && nLat < 24.0 && nLng > 102.0 && nLng < 110.0;
}

// -------------------------------------------------------------------
// 3. CHUẨN HÓA VÀ BÓC TÁCH ĐỊA CHỈ NÂNG CAO (KÈM PHÂN RÃ CẤP HẺM)
// -------------------------------------------------------------------
export function parseAndNormalizeAddress(rawAddress) {
  if (!rawAddress) {
    return {
      cleanAddress: '',
      street: 'Chưa rõ đường',
      houseNumber: '',
      houseNumVal: 999999,
      hasHouseNumber: false,
      isAlley: false,
      alleyTrunk: '',
      alleyLevels: [],
      alleyFingerprints: [],
      districtCode: '',
      buildingName: '',
      landmarkKey: null,
      landmarkCoords: null,
      locationFingerprint: '',
      secondaryPhone: null,
      extraNotes: '',
      warningFlags: []
    };
  }

  let addr = String(rawAddress).trim();
  let secondaryPhone = null;
  let extraNotes = '';
  const warningFlags = [];

  // BƯỚC 1: Bóc tách số điện thoại nhúng trong địa chỉ
  const phoneObj = extractPhone(addr);
  if (phoneObj) {
    secondaryPhone = phoneObj.phone;
    addr = addr.replace(phoneObj.raw, ' ').trim();
  }

  // BƯỚC 2: Bóc tách ghi chú giao hàng / giờ giấc nhúng trong địa chỉ
  const noteRegexes = [
    /\(([^)]*(?:gọi\s*trước|sau\s*5h|giờ\s*hành\s*chính|thu\s*khách|xem\s*hàng|kiểm\s*hàng|thất\s*bại|lưu\s*ý|giao\s*lại)[^)]*)\)/gi,
    /(?:ghi\s*chú|lưu\s*ý|note|gọi\s*trước\s*khi\s*(?:giao|tới)|gọi\s*trước|giao\s*giờ\s*hành\s*chính|sau\s*(?:17h|5h)|cho\s*khách\s*kiểm|thu\s*người\s*nhận|giao\s*thất\s*bại\s*thu)\s*[:\s]*([^,;.]+)/gi
  ];

  for (const reg of noteRegexes) {
    const match = addr.match(reg);
    if (match) {
      extraNotes += (extraNotes ? ' | ' : '') + match.join('; ').replace(/[()]/g, '').trim();
      addr = addr.replace(reg, ' ').trim();
    }
  }

  // BƯỚC 3: Chuẩn hóa cơ bản
  addr = normalizeAddress(addr);

  // BƯỚC 4: Nhận diện và xử lý Landmark POI
  let matchedLandmark = null;
  const addrNoTone = removeDiacritics(addr).toLowerCase();

  for (const lm of VERIFIED_LANDMARKS) {
    let isMatched = false;
    for (const name of lm.names) {
      const nameNoTone = removeDiacritics(name).toLowerCase();
      const escaped = nameNoTone.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp('\\b' + escaped + '\\b', 'i');
      if (reg.test(addrNoTone)) {
        isMatched = true;
        break;
      }
    }
    // Kiểm tra thêm theo tên đường + số nhà của Landmark
    if (!isMatched && lm.street && lm.houseNumber) {
      const stNoTone = removeDiacritics(lm.street).toLowerCase();
      if (addrNoTone.includes(stNoTone)) {
        const parts = lm.houseNumber.split(/[-–/]/).map(p => p.trim());
        if (parts.some(p => new RegExp(`(?:^|\\D)${p}(?:\\D|$)`).test(addrNoTone))) {
          isMatched = true;
        }
      }
    }
    if (isMatched) {
      matchedLandmark = lm;
      break;
    }
  }

  // BƯỚC 5: Xử lý thứ tự đảo: Tên đường trước, số nhà sau
  const mNumberedStreet = addr.match(/^(?:đường|phố|đ\.|đg\.)\s*(số\s*\d+[a-zA-Z]?)\s*[,.\s]+(?:nhà\s*số|số\s*nhà|nhà|số)?\s*[:\s]*([\d/]+[a-zA-Z-]*)(.*)$/i);
  if (mNumberedStreet) {
    const streetPart = 'Đường ' + mNumberedStreet[1].trim();
    const housePart = mNumberedStreet[2].trim();
    const restPart = mNumberedStreet[3].trim();
    addr = `${housePart} ${streetPart}${restPart ? ', ' + restPart.replace(/^[,.\s]+/, '') : ''}`;
  } else {
    const mInverted = addr.match(/^(?:đường|phố|đ\.|đg\.)\s*([a-zA-ZÀ-Ỹà-ỹ0-9\s/]+?)\s+(?:nhà\s*số|số\s*nhà|nhà)\s*[:\s]*([\d/]+[a-zA-Z-]*)(.*)$/i);
    if (mInverted && !/^\s*số\s*\d+/i.test(mInverted[1])) {
      const streetPart = mInverted[1].trim();
      const housePart = mInverted[2].trim();
      const restPart = mInverted[3].trim();
      addr = `${housePart} ${streetPart}${restPart ? ', ' + restPart.replace(/^[,.\s]+/, '') : ''}`;
    }
  }

  addr = addr.replace(/\s{2,}/g, ' ').replace(/^[,.\s-]+|[,.\s-]+$/g, '').trim();

  // BƯỚC 6: Trích xuất Tên đường và Số nhà
  const clusterRaw = extractClusterName(addr);
  const streetName = clusterRaw.replace(/^(?:đường|phố)\s+/i, '').trim();

  let houseNumber = '';
  let houseNumVal = 999999;
  let hasHouseNumber = false;

  let addrForHouseNum = addr.replace(/(?:tầng|lầu|phòng|p\.|căn\s*hộ|block|lô)\s*[\d\w-]+\s*,?\s*/gi, '');

  const mNum = addrForHouseNum.match(/^(?:số|nhà|sô)?\s*([\d]+[a-zA-Z]*(?:[\/\-][\d]+[a-zA-Z]*)*(?:\s*[\/\-]\s*[\d]+[a-zA-Z]*)*)/i);
  if (mNum) {
    houseNumber = mNum[1].replace(/\s+/g, '');
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
    warningFlags.push('missing_house_number');
  }

  // BƯỚC 6.5: BÓC TÁCH CẤP HẺM ĐA TẦNG (ALLEY HIERARCHY)
  let isAlley = false;
  let alleyTrunk = '';
  const alleyLevels = [];

  if (houseNumber && houseNumber.includes('/')) {
    isAlley = true;
    const parts = houseNumber.split('/');
    alleyTrunk = parts[0].trim();
    let currentLvl = parts[0].trim();
    alleyLevels.push(currentLvl); // Cấp 0: Đầu hẻm chính trên mặt tiền
    for (let p = 1; p < parts.length; p++) {
      currentLvl += '/' + parts[p].trim();
      alleyLevels.push(currentLvl); // Cấp 1, 2, 3...
    }
  } else if (hasHouseNumber) {
    alleyTrunk = houseNumber;
    alleyLevels.push(houseNumber);
  }

  // BƯỚC 7: Xây dựng locationFingerprint duy nhất & Alley Fingerprints
  let locationFingerprint = '';
  const normalizedAddress = removeDiacritics(addr).toLowerCase();
  const numericDistrict = normalizedAddress.match(/\b(?:quan|q\.?|huyen)\s*(\d{1,2})\b/);
  const compactAddress = normalizedAddress.replace(/[^a-z0-9]/g, '');
  const distCode = numericDistrict
    ? 'q' + numericDistrict[1]
    : Object.keys(DISTRICT_CENTERS).find(key => !key.startsWith('q') && compactAddress.includes(key)) || '';
  const distKey = distCode ? ('_' + distCode) : '';
  const cleanStKey = removeDiacritics(streetName).toLowerCase().replace(/[^a-z0-9]/g, '');
  const cleanHouseKey = houseNumber.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (matchedLandmark) {
    locationFingerprint = 'bld_' + matchedLandmark.key;
  } else if (cleanStKey && cleanHouseKey) {
    locationFingerprint = `addr_${cleanHouseKey}_${cleanStKey}${distKey}`;
  } else if (cleanStKey) {
    locationFingerprint = `street_${cleanStKey}${distKey}`;
  } else {
    locationFingerprint = `raw_${Math.abs(hashString(addr))}`;
  }

  const alleyFingerprints = (cleanStKey && alleyLevels.length > 0)
    ? alleyLevels.map(lvl => `addr_${lvl.toLowerCase().replace(/[^a-z0-9]/g, '')}_${cleanStKey}${distKey}`)
    : [];

  return {
    cleanAddress: addr,
    street: streetName,
    clusterGroup: clusterRaw,
    houseNumber: houseNumber,
    houseNumVal: houseNumVal,
    hasHouseNumber: hasHouseNumber,
    isAlley: isAlley,
    alleyTrunk: alleyTrunk,
    alleyLevels: alleyLevels,
    alleyFingerprints: alleyFingerprints,
    districtCode: distCode,
    buildingName: matchedLandmark ? matchedLandmark.names[0] : '',
    landmarkKey: matchedLandmark ? matchedLandmark.key : null,
    landmarkCoords: matchedLandmark ? { lat: matchedLandmark.lat, lng: matchedLandmark.lng } : null,
    locationFingerprint: locationFingerprint,
    secondaryPhone: secondaryPhone,
    extraNotes: extraNotes,
    warningFlags: warningFlags
  };
}

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

// -------------------------------------------------------------------
// 4. PHÁT HIỆN TỌA ĐỘ LỆCH XA, TỌA ĐỘ BƯU CỤC ẢO & LỆCH QUẬN
// -------------------------------------------------------------------
export function detectCoordinateOutliers(orders) {
  if (!orders || orders.length === 0) return [];
  const outliers = [];

  // BƯỚC 1: Khởi tạo dữ liệu
  orders.forEach(o => {
    o.isGpsOutlier = false;
    o.isFakeHubCoord = false;
    o.isDistrictMismatch = false;
    o.gpsOutlierDist = 0;
    o.outlierReason = '';
  });

  // BƯỚC 2: PHÁT HIỆN TỌA ĐỘ BƯU CỤC / UBND ẢO (FAKE HUB CLUSTERS)
  // Nếu từ 2 đơn có tên đường khác nhau nhưng lại có tọa độ trùng khít (< 15m)
  const coordBuckets = {};
  orders.forEach(o => {
    if (isValidCoord(o.lat, o.lng)) {
      const key = (Math.round(Number(o.lat) * 10000) / 10000) + '_' + (Math.round(Number(o.lng) * 10000) / 10000);
      if (!coordBuckets[key]) coordBuckets[key] = [];
      coordBuckets[key].push(o);
    }
  });

  for (const k in coordBuckets) {
    const bucket = coordBuckets[k];
    if (bucket.length >= 2) {
      const distinctStreets = new Set();
      bucket.forEach(o => {
        const pInfo = o.parsedGeo || parseAndNormalizeAddress(o.address);
        if (pInfo.street && pInfo.street !== 'Chưa rõ đường') {
          distinctStreets.add(pInfo.street.toLowerCase());
        }
      });
      if (distinctStreets.size >= 2) {
        bucket.forEach(o => {
          o.isFakeHubCoord = true;
          o.isGpsOutlier = true;
          o.gpsOutlierDist = 999;
          o.outlierReason = 'Tọa độ ảo bưu cục/UBND (gán chung cho nhiều con đường khác nhau)';
          if (!outliers.includes(o)) outliers.push(o);
        });
      }
    }
  }

  // BƯỚC 3: KIỂM TRA CHÉO RANH GIỚI QUẬN / HUYỆN (DISTRICT VALIDATION)
  orders.forEach(o => {
    if (isValidCoord(o.lat, o.lng) && !o.isFakeHubCoord) {
      const pInfo = o.parsedGeo || parseAndNormalizeAddress(o.address);
      if (pInfo.districtCode && DISTRICT_CENTERS[pInfo.districtCode]) {
        const distInfo = DISTRICT_CENTERS[pInfo.districtCode];
        const distM = getCoordDistanceMeters(o.lat, o.lng, distInfo.lat, distInfo.lng);
        if (distM > distInfo.radius + 1500) {
          o.isDistrictMismatch = true;
          o.isGpsOutlier = true;
          o.gpsOutlierDist = Math.round(distM - distInfo.radius);
          o.outlierReason = `Lệch ranh giới ${distInfo.name} (${Math.round(distM / 1000)}km so với trung tâm quận)`;
          if (!outliers.includes(o)) outliers.push(o);
        }
      }
    }
  });

  // BƯỚC 4: TÍNH TOÁN TRUNG VỊ ĐƯỜNG DỰA TRÊN CÁC ĐƠN THẬT (LOẠI BỎ TỌA ĐỘ ẢO)
  const streetCoords = {};
  const validTripCoords = [];

  orders.forEach(o => {
    if (isValidCoord(o.lat, o.lng) && !o.isFakeHubCoord && !o.isDistrictMismatch) {
      const pInfo = o.parsedGeo || parseAndNormalizeAddress(o.address);
      const st = pInfo.street || 'Chưa rõ đường';
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
        list.forEach(item => {
          const dist = getCoordDistanceMeters(item.lat, item.lng, medLat, medLng);
          const threshold = list.length >= 4 ? 900 : 1400;
          if (dist > threshold) {
            item.order.isGpsOutlier = true;
            item.order.gpsOutlierDist = Math.round(dist);
            item.order.outlierReason = `Lệch ${Math.round(dist)}m so với cụm đường ${st}`;
            if (!outliers.includes(item.order)) outliers.push(item.order);
          }
        });
      } else if (list.length === 1 && tripMedianLat != null) {
        const item = list[0];
        const distTrip = getCoordDistanceMeters(item.lat, item.lng, tripMedianLat, tripMedianLng);
        if (distTrip > 3500) {
          item.order.isGpsOutlier = true;
          item.order.gpsOutlierDist = Math.round(distTrip);
          item.order.outlierReason = `Lệch ${Math.round(distTrip)}m so với toàn bộ chuyến`;
          if (!outliers.includes(item.order)) outliers.push(item.order);
        }
      }
    }
  }

  // Gán tọa độ trung vị chuẩn cho TẤT CẢ các đơn
  orders.forEach(o => {
    const pInfo = o.parsedGeo || parseAndNormalizeAddress(o.address);
    const st = pInfo.street || 'Chưa rõ đường';
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

// -------------------------------------------------------------------
// 5. THUẬT TOÁN TỰ ĐỘNG NẮN SỬA TỌA ĐỘ ĐA TẦNG (KÈM LÙI CẤP HẺM)
// -------------------------------------------------------------------
export function healTripCoordinates(orders) {
  if (!orders || orders.length === 0) return { healedCount: 0, outlierCount: 0, alleySnappedCount: 0, fakeHubCount: 0 };

  let healedCount = 0;
  let alleySnappedCount = 0;
  let fakeHubCount = 0;

  // Bước 1: Phân tích chuẩn hóa địa chỉ cho tất cả các đơn
  orders.forEach(o => {
    if (!o.parsedGeo) {
      o.parsedGeo = parseAndNormalizeAddress(o.address);
      o.locationFingerprint = o.parsedGeo.locationFingerprint;
      o.hasHouseNumber = o.parsedGeo.hasHouseNumber;
      if (o.parsedGeo.secondaryPhone && !o.secondaryPhone) {
        o.secondaryPhone = o.parsedGeo.secondaryPhone;
      }
      if (o.parsedGeo.extraNotes) {
        o.notes = o.notes ? (o.notes + ' | ' + o.parsedGeo.extraNotes) : o.parsedGeo.extraNotes;
      }
    }
  });

  // Bước 2: Nắn toạ độ theo TẦNG 1: Khớp Landmark POI (100% chuẩn)
  orders.forEach(o => {
    if (o.parsedGeo && o.parsedGeo.landmarkCoords) {
      const lm = o.parsedGeo.landmarkCoords;
      const needUpdate = !isValidCoord(o.lat, o.lng) || getCoordDistanceMeters(o.lat, o.lng, lm.lat, lm.lng) > 80;
      if (needUpdate) {
        o.lat = lm.lat;
        o.lng = lm.lng;
        o.isGpsOutlier = false;
        o.isFakeHubCoord = false;
        o.isDistrictMismatch = false;
        o.isGpsHealed = true;
        o.healedSource = 'landmark_poi';
        healedCount++;
      }
    }
  });

  // Bước 3: Phát hiện các đơn bị Outlier, Tọa độ ảo bưu cục & Lệch quận
  const outliers = detectCoordinateOutliers(orders);
  fakeHubCount = orders.filter(o => o.isFakeHubCoord).length;

  // Bước 4: Nắn toạ độ theo TẦNG 2: Mượn tọa độ cùng địa chỉ / cùng toà nhà (Peer-snapping)
  const fpGroups = {};
  orders.forEach(o => {
    const fp = o.locationFingerprint;
    if (fp && !fp.startsWith('street_') && !fp.startsWith('raw_')) {
      if (!fpGroups[fp]) fpGroups[fp] = [];
      fpGroups[fp].push(o);
    }
  });

  for (const fp in fpGroups) {
    const grp = fpGroups[fp];
    const validLeader = grp.find(x => isValidCoord(x.lat, x.lng) && !x.isGpsOutlier);
    if (validLeader) {
      const refLat = Number(validLeader.lat);
      const refLng = Number(validLeader.lng);

      grp.forEach(member => {
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
          member.isFakeHubCoord = false;
          member.isDistrictMismatch = false;
          member.isGpsHealed = true;
          member.healedSource = 'peer_snapping';
          healedCount++;
        }
      });
    }
  }

  // Bước 4.5: NẮN TỌA ĐỘ THEO TẦNG 2.5: THUẬT TOÁN LÙI CẤP HẺM (ALLEY STEP-BACK SNAPPING)
  // Xây dựng bản đồ các cấp hẻm đã có GPS chuẩn
  const alleyCoordMap = {};
  orders.forEach(o => {
    if (isValidCoord(o.lat, o.lng) && !o.isGpsOutlier && o.parsedGeo && o.parsedGeo.isAlley) {
      const pGeo = o.parsedGeo;
      if (pGeo.alleyFingerprints && pGeo.alleyFingerprints.length > 0) {
        pGeo.alleyFingerprints.forEach(afp => {
          if (!alleyCoordMap[afp]) {
            alleyCoordMap[afp] = { lat: Number(o.lat), lng: Number(o.lng), order: o };
          }
        });
      }
    }
  });

  orders.forEach(o => {
    if ((!isValidCoord(o.lat, o.lng) || o.isGpsOutlier) && o.parsedGeo && o.parsedGeo.isAlley) {
      const afps = o.parsedGeo.alleyFingerprints || [];
      // Lùi dần từ cấp hẻm sâu nhất về đầu hẻm chính (Level 0)
      for (let idx = afps.length - 1; idx >= 0; idx--) {
        const afpKey = afps[idx];
        if (alleyCoordMap[afpKey]) {
          const match = alleyCoordMap[afpKey];
          o.lat = match.lat;
          o.lng = match.lng;
          o.isGpsOutlier = false;
          o.isFakeHubCoord = false;
          o.isDistrictMismatch = false;
          o.isGpsHealed = true;
          o.healedSource = (idx === afps.length - 1) ? 'alley_exact' : (idx === 0 ? 'alley_trunk' : 'alley_stepback');
          o.healedAlleyLevel = o.parsedGeo.alleyLevels[idx];
          healedCount++;
          alleySnappedCount++;
          break;
        }
      }
    }
  });

  // Bước 5: Nắn toạ độ theo TẦNG 3: Nội suy số nhà chẵn/lẻ trên cùng tuyến đường
  const streetHouseData = {};
  orders.forEach(o => {
    if (isValidCoord(o.lat, o.lng) && !o.isGpsOutlier && o.parsedGeo && o.parsedGeo.hasHouseNumber) {
      const st = o.parsedGeo.street;
      const numVal = o.parsedGeo.houseNumVal;
      if (numVal > 0 && numVal < 999999) {
        if (!streetHouseData[st]) streetHouseData[st] = [];
        streetHouseData[st].push({
          numVal: numVal,
          isEven: numVal % 2 === 0,
          lat: Number(o.lat),
          lng: Number(o.lng)
        });
      }
    }
  });

  orders.forEach(o => {
    if ((!isValidCoord(o.lat, o.lng) || o.isGpsOutlier) && o.parsedGeo && o.parsedGeo.hasHouseNumber) {
      const st = o.parsedGeo.street;
      const targetVal = o.parsedGeo.houseNumVal;
      const targetEven = targetVal % 2 === 0;

      const candidates = streetHouseData[st];
      if (candidates && candidates.length >= 2) {
        const sameSide = candidates.filter(c => c.isEven === targetEven);
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
            o.isFakeHubCoord = false;
            o.isDistrictMismatch = false;
            o.isGpsHealed = true;
            o.healedSource = 'interpolation';
            healedCount++;
          }
        }
      }
    }
  });

  // Bước 6: Nắn toạ độ theo TẦNG 4: Đơn thiếu số nhà hoặc chưa có GPS -> Neo tim đường chuẩn
  orders.forEach(o => {
    if (!isValidCoord(o.lat, o.lng) || o.isGpsOutlier) {
      if (o.streetMedianLat && o.streetMedianLng) {
        o.lat = o.streetMedianLat;
        o.lng = o.streetMedianLng;
        o.isGpsOutlier = false;
        o.isFakeHubCoord = false;
        o.isDistrictMismatch = false;
        o.isGpsHealed = true;
        o.healedSource = o.parsedGeo && o.parsedGeo.hasHouseNumber ? 'street_median_fallback' : 'street_median';
        healedCount++;
      }
    }
  });

  return {
    healedCount: healedCount,
    outlierCount: outliers.length,
    alleySnappedCount: alleySnappedCount,
    fakeHubCount: fakeHubCount
  };
}

// -------------------------------------------------------------------
// 6. ĐO LƯỜNG VÀ SO SÁNH ĐỘ CHÍNH XÁC GPS (PHASE 1 ACCURACY BENCHMARK)
// -------------------------------------------------------------------
export function calculateGpsAccuracyReport(orders) {
  if (!orders || orders.length === 0) {
    return {
      total: 0,
      validGpsCount: 0,
      landmarkCount: 0,
      exactPeerCount: 0,
      alleySnappedCount: 0,
      fakeHubCount: 0,
      districtMismatchCount: 0,
      medianCount: 0,
      unmappedCount: 0,
      accuracyScore: 0,
      items: []
    };
  }

  let total = orders.length;
  let validGpsCount = 0;
  let landmarkCount = 0;
  let exactPeerCount = 0;
  let alleySnappedCount = 0;
  let fakeHubCount = 0;
  let districtMismatchCount = 0;
  let medianCount = 0;
  let unmappedCount = 0;

  const items = orders.map((o, idx) => {
    const hasGps = isValidCoord(o.lat, o.lng);
    const pGeo = o.parsedGeo || parseAndNormalizeAddress(o.address);
    let level = 'unmapped';
    let label = 'Chưa có GPS';
    let confidence = 0;
    let improvement = 'Chưa xác định được vị trí';

    if (hasGps) {
      validGpsCount++;
      if (o.isFakeHubCoord) {
        fakeHubCount++;
        level = 'fake_hub';
        label = 'Tọa độ ảo Bưu cục / UBND';
        confidence = 20;
        improvement = 'Đã phát hiện gán nhầm điểm hub';
      } else if (o.isDistrictMismatch) {
        districtMismatchCount++;
        level = 'district_mismatch';
        label = 'Lệch ranh giới Quận';
        confidence = 25;
        improvement = 'Đã phát hiện định vị nhầm quận xa';
      } else if (o.isGpsOutlier) {
        level = 'gps_outlier';
        label = 'Tọa độ nghi ngờ lệch';
        confidence = 0;
        improvement = o.outlierReason || 'Cần kiểm tra lại vị trí';
      } else if (o.healedSource === 'landmark_poi' || (pGeo.landmarkCoords && Math.abs(o.lat - pGeo.landmarkCoords.lat) < 0.0001)) {
        landmarkCount++;
        level = 'landmark';
        label = 'Landmark POI tham chiếu';
        confidence = 85;
        improvement = 'Tọa độ tham chiếu từ Landmark; cần kiểm tra lối vào thực tế';
      } else if (o.healedSource === 'co_location' || o.healedSource === 'peer_snapping') {
        exactPeerCount++;
        level = 'exact_peer';
        label = 'Cùng số nhà đã xác thực';
        confidence = 96;
        improvement = 'Khớp vị trí với đơn cùng số nhà';
      } else if (o.healedSource === 'alley_exact' || o.healedSource === 'alley_stepback' || o.healedSource === 'alley_trunk') {
        alleySnappedCount++;
        level = 'alley_snapped';
        const lvlStr = o.healedAlleyLevel || (pGeo.alleyTrunk ? ('Đầu hẻm ' + pGeo.alleyTrunk) : 'Nhánh hẻm');
        label = `Bắt dính hẻm [${lvlStr}]`;
        confidence = (o.healedSource === 'alley_exact') ? 95 : (o.healedSource === 'alley_trunk' ? 82 : 88);
        improvement = 'Cứu đơn khỏi việc rơi tim đường, neo đúng nhánh hẻm';
      } else if (o.healedSource === 'interpolation' || o.healedSource === 'building_snap') {
        level = 'snapped';
        label = 'Nội suy số nhà';
        confidence = 80;
        improvement = 'Khớp theo dãy số nhà liên tiếp';
      } else if (o.healedSource === 'street_median' || o.healedSource === 'street_median_fallback') {
        medianCount++;
        level = 'street_median';
        label = 'Tim đường trung vị';
        confidence = 55;
        improvement = 'Định vị tâm tuyến đường (cần bổ sung hẻm)';
      } else {
        level = 'original_gps';
        label = 'GPS theo đơn gốc';
        confidence = 78;
        improvement = 'Tọa độ có sẵn từ hệ thống';
      }
    } else {
      unmappedCount++;
    }

    return {
      order: o,
      stt: idx + 1,
      address: o.address,
      street: pGeo.street,
      houseNumber: pGeo.houseNumber,
      isAlley: pGeo.isAlley,
      level: level,
      label: label,
      confidence: confidence,
      improvement: improvement,
      lat: o.lat,
      lng: o.lng
    };
  });

  const totalConfidence = items.reduce((acc, cur) => acc + cur.confidence, 0);
  const accuracyScore = Math.round(totalConfidence / (total || 1));

  return {
    total: total,
    validGpsCount: validGpsCount,
    landmarkCount: landmarkCount,
    exactPeerCount: exactPeerCount,
    alleySnappedCount: alleySnappedCount,
    fakeHubCount: fakeHubCount,
    districtMismatchCount: districtMismatchCount,
    medianCount: medianCount,
    unmappedCount: unmappedCount,
    accuracyScore: accuracyScore,
    items: items
  };
}
