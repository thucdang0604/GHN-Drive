/**
 * parser.js - Bộ chuẩn hóa địa chỉ và phân tích chuỗi nhập liệu thông minh cho GHN
 * Hỗ trợ nhận diện:
 * - Chuẩn hóa địa chỉ: khử trùng lặp toà nhà, lược bỏ tên phường không dấu dư thừa, lược bỏ mã bưu chính & quốc gia
 * - Chuẩn hóa từ viết tắt hành chính (P., Q., TP.HCM) để hiển thị gọn gàng, tránh tràn dòng
 * - Mã vận đơn (VNGH..., GY8..., SPX..., J&T... hoặc 6-22 ký tự)
 * - Tên người nhận (tự động làm sạch ký tự lạ <>, dấu ngoặc)
 * - Số điện thoại đa định dạng (có dấu chấm, dấu cách, dấu ngoặc như (0903) 960-546, SĐT cố định 028...)
 * - Nhận diện SĐT ngay cả khi nằm cùng dòng với tên khách
 * - Giá tiền COD (không bắt nhầm SĐT hay tiền cước trong ghi chú)
 * - Dòng ghi chú riêng biệt: (Giao thất bại thu người nhận 20,000 VNĐ)
 * - Dán nhiều đơn cùng một lúc (hỗ trợ cả Tab-separated TSV từ Excel)
 */

import { parseAndNormalizeAddress, healTripCoordinates, isValidCoord } from './geo-healer.js';
export { parseAndNormalizeAddress, healTripCoordinates, isValidCoord };

export function removeDiacritics(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

export function normalizeAddress(addr) {
  if (!addr) return '';
  let s = addr.trim();

  // 1. Loại bỏ tiền tố không cần thiết
  s = s.replace(/^(?:địa\s*chỉ\s*(?:giao|nhận)?|đ\/c|address)\s*:\s*/i, '');

  // 2. Loại bỏ quốc gia và mã bưu chính ở cuối
  s = s.replace(/[,.\s]*(?:Việt\s*Nam|Vietnam|VN)[\s.]*$/i, '');
  s = s.replace(/[,.\s]*\b\d{5,6}\b[\s.]*$/, '');

  // 3. Tách theo dấu phẩy để xử lý từng đoạn
  const parts = s.split(',').map(p => p.trim()).filter(Boolean);
  const cleanedParts = [];

  for (let i = 0; i < parts.length; i++) {
    let pClean = parts[i];

    // Kiểm tra nếu đoạn tiếp theo là 'Phường X' và đoạn hiện tại bị dính đuôi 'X' không dấu
    if (i + 1 < parts.length) {
      const nextP = parts[i + 1];
      const mWard = nextP.match(/(?:phường|p\.)\s*(.+)/i);
      if (mWard) {
        const wardName = mWard[1].trim();
        const wardNoAccent = removeDiacritics(wardName).toLowerCase();
        const words = pClean.split(/\s+/);
        const wardWords = wardName.split(/\s+/);
        if (words.length > wardWords.length) {
          const tailNoAccent = removeDiacritics(words.slice(-wardWords.length).join(' ')).toLowerCase();
          if (tailNoAccent === wardNoAccent) {
            const remainder = words.slice(0, -wardWords.length).join(' ');
            // Không cắt nếu phần còn lại chỉ là số nhà (để bảo tồn tên đường như "152B Võ Thị Sáu")
            if (!/^(?:số|nhà|hẻm|ngõ)?\s*[\d/]+[a-z\d-]*$/i.test(remainder)) {
              pClean = remainder;
            }
          }
        }
      }
    }

    // Loại bỏ các cụm từ bị lặp lại từ các phần trước (như tên toà nhà lặp 2 lần)
    for (let j = 0; j < cleanedParts.length; j++) {
      const prev = cleanedParts[j];
      if (prev.length >= 4) {
        const escaped = prev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pClean = pClean.replace(new RegExp('\\b' + escaped + '\\b', 'gi'), '').trim();
      }
    }

    pClean = pClean.replace(/\s{2,}/g, ' ').replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    if (pClean && !cleanedParts.some(cp => cp.toLowerCase() === pClean.toLowerCase())) {
      cleanedParts.push(pClean);
    }
  }

  let res = cleanedParts.join(', ');

  // Chuẩn hóa tên thành phố / quận / phường gọn gàng, tránh tràn dòng trên di động
  res = res.replace(/(?:TP\.?\s*Hồ\s*Chí\s*Minh|Thành\s*phố\s*Hồ\s*Chí\s*Minh|Hồ\s*Chí\s*Minh)/gi, 'TP.HCM');
  res = res.replace(/(?:Thành\s*phố\s*Hà\s*Nội|TP\.?\s*Hà\s*Nội)/gi, 'Hà Nội');
  res = res.replace(/(?:Thành\s*phố\s*Đà\s*Nẵng|TP\.?\s*Đà\s*Nẵng)/gi, 'Đà Nẵng');
  res = res.replace(/\b(?:Ba|Bà),?\s*Huyện\s*Thanh\s*Quan\b/gi, 'Bà Huyện Thanh Quan');
  res = res.replace(/\bĐường\s+/gi, '');
  res = res.replace(/\bPhường\s+/gi, 'P. ');
  res = res.replace(/\bQuận\s+/gi, 'Q. ');
  res = res.replace(/\bThị\s*trấn\s+/gi, 'TT. ');
  res = res.replace(/(?<!\bBà\s+)\bHuyện\s+/gi, 'H. ');

  res = res.replace(/\s*,\s*/g, ', ');
  res = res.replace(/(?:,\s*)+/g, ', ');
  res = res.replace(/\s{2,}/g, ' ');

  // Khử trùng lặp các từ liền kề
  const tokens = res.split(', ').map(t => t.trim()).filter(Boolean);
  const uniqueTokens = [];
  for (let k = 0; k < tokens.length; k++) {
    const t = tokens[k];
    if (uniqueTokens.length === 0 || uniqueTokens[uniqueTokens.length - 1].toLowerCase() !== t.toLowerCase()) {
      uniqueTokens.push(t);
    }
  }
  return uniqueTokens.join(', ');
}

export function extractPhone(line) {
  if (!line) return null;
  if (/giao\s*thất\s*bại\s*thu|ghi\s*chú|lưu\s*ý/i.test(line)) return null;

  const candidate = line.match(/(?:\+?84|0|\(\+?84\)|\(0\d{1,4}\))[\s.-]*\d(?:[\s.-]*\d){4,10}\b/);
  if (candidate) {
    const raw = candidate[0];
    let digits = raw.replace(/[^\d+]/g, '');
    if (digits.startsWith('+84')) digits = '0' + digits.slice(3);
    else if (digits.startsWith('84') && digits.length >= 11) digits = '0' + digits.slice(2);

    if ((digits.length === 10 || digits.length === 11) && digits.startsWith('0')) {
      return { raw: raw, phone: digits };
    }
  }
  return null;
}

export function isTrackingCode(line) {
  if (!line) return false;
  const clean = line.trim();
  if (/^(?:mã\s*vận\s*đơn|ma\s*van\s*don|mã\s*đơn|tracking|mvd)\s*:/i.test(clean)) return true;
  if (/^(?:#|\d+\.\s*)?[A-Z0-9]{6,22}$/i.test(clean) && !/^0\d{8,11}$/.test(clean) && /[A-Za-z]/i.test(clean)) return true;
  return false;
}

export function parseRawOrderText(rawText) {
  if (!rawText || !rawText.trim()) return [];

  const rawLines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const blocks = [];
  let curr = [];

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    if (line.includes('\t')) {
      if (curr.length > 0) { blocks.push(curr); curr = []; }
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

    // Xử lý dòng copy từ Excel/Sheets cách nhau bằng Tab (\t)
    if (bLines.length === 1 && bLines[0].includes('\t')) {
      const rawCols = bLines[0].split('\t').map(c => c.trim());

      // Nhận diện cấu trúc bảng Google Sheet 12-13 cột
      // [0]: Thời Gian | [1]: Mã Đơn | [2]: Mã Chuyến | [3]: Tên Người Nhận | [4]: SĐT | [5]: Địa Chỉ Chi Tiết | [6]: Phường/Xã | [7]: Quận/Huyện | [8]: Tỉnh/TP | [9]: Lat | [10]: Lng | [11]: Phải Thu | [12]: GTB-Thu
      if (rawCols.length >= 11 && isTrackingCode(rawCols[1])) {
        const rawAddr = rawCols[5] || '';
        const ward = rawCols[6] || '';
        const district = rawCols[7] || '';
        const city = rawCols[8] || '';
        let fullAddr = rawAddr;
        if (ward && !fullAddr.toLowerCase().includes(ward.toLowerCase())) fullAddr += ', ' + ward;
        if (district && !fullAddr.toLowerCase().includes(district.toLowerCase())) fullAddr += ', ' + district;
        if (city && !fullAddr.toLowerCase().includes(city.toLowerCase())) fullAddr += ', ' + city;

        const pGeo = parseAndNormalizeAddress(fullAddr);
        const ph = extractPhone(rawCols[4]);
        const phaiThu = parseMoneyCell({ v: rawCols[11] });
        const gtbThu = parseMoneyCell({ v: rawCols[12] });

        results.push({
          id: 'ghn_' + Date.now() + '_' + b + '_' + Math.random().toString(36).substr(2, 5),
          trackingCode: rawCols[1].replace(/^[#\s]+|[.,\s]+$/g, ''),
          tripCode: rawCols[2] || '',
          customerName: (rawCols[3] || 'Khách lẻ').replace(/[<>]/g, '').trim(),
          phone: ph ? ph.phone : (pGeo.secondaryPhone || (rawCols[4] || '').replace(/[^\d+]/g, '').trim()),
          secondaryPhone: pGeo.secondaryPhone,
          address: pGeo.cleanAddress || normalizeAddress(fullAddr),
          codAmount: phaiThu,
          phaiThu: phaiThu,
          gtbThu: gtbThu,
          notes: pGeo.extraNotes || '',
          status: 'pending',
          groupId: 'group_ungrouped',
          lat: rawCols[9] ? Number(rawCols[9]) : (pGeo.landmarkCoords ? pGeo.landmarkCoords.lat : null),
          lng: rawCols[10] ? Number(rawCols[10]) : (pGeo.landmarkCoords ? pGeo.landmarkCoords.lng : null),
          locationFingerprint: pGeo.locationFingerprint,
          hasHouseNumber: pGeo.hasHouseNumber,
          parsedGeo: pGeo,
          createdAt: new Date().toISOString()
        });
        continue;
      }

      const cols = rawCols.filter(Boolean);
      const tItem = {
        trackingCode: '',
        customerName: '',
        phone: '',
        address: '',
        codAmount: 0,
        phaiThu: 0,
        gtbThu: 0,
        notes: '',
        status: 'pending',
        createdAt: new Date().toISOString()
      };
      for (let c = 0; c < cols.length; c++) {
        const col = cols[c];
        const ph = extractPhone(col);
        if (ph && !tItem.phone) {
          tItem.phone = ph.phone;
        } else if (isTrackingCode(col) && !tItem.trackingCode) {
          tItem.trackingCode = col.replace(/^(?:mã\s*vận\s*đơn|ma\s*van\s*don|tracking|mvd)\s*:\s*/i, '').replace(/^[#\s]+|[.,\s]+$/g, '');
        } else if (/(?:đường|phường|quận|huyện|tp|tỉnh|ấp|xã|toà|tòa|số|kdc|khu|p\.|q\.)/i.test(col) && !tItem.address) {
          tItem.address = normalizeAddress(col);
        } else if (/^\d[\d.,\s]*(?:vnđ|đ|vnd|k)?\.?$/i.test(col) && !tItem.codAmount && !/^\d{1,2}\.\d{4,}$/.test(col)) {
          const numM = col.match(/\d[\d.,]*/);
          if (numM) {
            let val = parseInt(numM[0].replace(/[^\d]/g, ''), 10);
            if (/k/i.test(col) && val < 1000) val *= 1000;
            tItem.codAmount = isNaN(val) ? 0 : val;
            tItem.phaiThu = tItem.codAmount;
          }
        } else if (!tItem.customerName) {
          tItem.customerName = col.replace(/[<>]/g, '').trim();
        }
      }
      if (tItem.trackingCode || tItem.customerName || tItem.phone || tItem.address) {
        results.push(tItem);
      }
      continue;
    }

    const item = {
      trackingCode: '',
      customerName: '',
      phone: '',
      address: '',
      codAmount: 0,
      notes: '',
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    const addrParts = [];

    for (let l = 0; l < bLines.length; l++) {
      const line = bLines[l];

      // 1. Kiểm tra dòng ghi chú
      if (/^\(.*\)$/.test(line) || /giao\s*thất\s*bại\s*thu|ghi\s*chú|lưu\s*ý|thu\s*người\s*nhận|cho\s*khách\s*kiểm|gọi\s*trước/i.test(line)) {
        item.notes = line.trim();
        continue;
      }

      // 2. Nhãn hoặc mã vận đơn
      if (!item.trackingCode && isTrackingCode(line)) {
        const p = line.split(/:(.+)/);
        const code = p[1] ? p[1].trim() : line.trim();
        item.trackingCode = code.replace(/^[#\s]+|[.,\s]+$/g, '');
        continue;
      }

      // 3. Số điện thoại (kể cả khi dính vào tên khách hàng)
      const ph = extractPhone(line);
      if (ph && !item.phone) {
        item.phone = ph.phone;
        const remText = line.replace(ph.raw, '').replace(/[<>:,()-]/g, '').trim();
        if (remText && !item.customerName) {
          item.customerName = remText;
        }
        continue;
      }

      // 4. Nhãn tường minh: Tên khách
      if (/^(?:tên|khách\s*hàng|người\s*nhận)\s*:/i.test(line)) {
        const p = line.split(/:(.+)/);
        if (p[1]) item.customerName = p[1].replace(/[<>]/g, '').trim();
        continue;
      }

      // 5. Giá tiền COD
      if (/(?:giá\s*tiền|tiền|cod|giá)\s*[:\s]*\d/i.test(line) || /^\d[\d.,\s]*(?:vnđ|đ|vnd|k)\.?$/i.test(line) || line === '0' || line === '0 VNĐ' || line === '0đ') {
        const numMatch = line.match(/\d[\d.,]*/);
        if (numMatch) {
          let num = parseInt(numMatch[0].replace(/[^\d]/g, ''), 10);
          if (/k/i.test(line) && num < 1000) num *= 1000;
          item.codAmount = isNaN(num) ? 0 : num;
        }
        continue;
      }

      // 6. Nhãn tường minh: Địa chỉ
      if (/^(?:địa\s*chỉ|đ\/c|address)\s*:/i.test(line)) {
        const p = line.split(/:(.+)/);
        if (p[1]) addrParts.push(p[1].trim());
        continue;
      }

      // 7. Dòng địa chỉ theo từ khóa
      if (/(?:đường|phường|quận|huyện|thành phố|tp|tỉnh|ấp|xã|tòa|toà|số|centec|kdc|khu|p\.|q\.)/i.test(line)) {
        addrParts.push(line);
        continue;
      }

      // 8. Tên người nhận (fallback)
      if (!item.customerName) {
        item.customerName = line.replace(/[<>]/g, '').trim();
      } else {
        addrParts.push(line);
      }
    }

    if (addrParts.length > 0) {
      item.address = normalizeAddress(addrParts.join(', '));
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
          item.notes = item.notes ? (item.notes + ' | ' + pGeo.extraNotes) : pGeo.extraNotes;
        }
        if (pGeo.landmarkCoords) {
          item.lat = pGeo.landmarkCoords.lat;
          item.lng = pGeo.landmarkCoords.lng;
          item.isGpsHealed = true;
          item.healedSource = 'landmark_poi';
        }
      }
      results.push(item);
    }
  }

  return results;
}

export function parseCurrency(str) {
  if (!str) return 0;
  const cleaned = str.replace(/[^\d]/g, '');
  const num = parseInt(cleaned, 10);
  return isNaN(num) ? 0 : num;
}

export function formatCurrency(amount) {
  const num = typeof amount === 'number' ? amount : (parseInt(amount, 10) || 0);
  return new Intl.NumberFormat('vi-VN').format(num) + ' đ';
}

const GOOGLE_SHEET_ID = '17jlmfVycw4L0ozXEPW878dkSPdkSM9Ny5eby9XTUCcs';

export function extractTripCode(str) {
  if (!str) return '';
  const clean = str.trim();
  const m = clean.match(/(?:trip-detail\/|tripCode=|\/)([A-Z0-9]{10,25})/i);
  if (m) return m[1];
  const mCode = clean.match(/[A-Z0-9]{10,25}/i);
  return mCode ? mCode[0] : clean;
}

export function removeVietnameseTones(str) {
  if (!str) return '';
  return str.normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().trim();
}

export function countVietnameseAccents(str) {
  const matches = str.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi);
  return matches ? matches.length : 0;
}

export function extractClusterName(address) {
  if (!address) return 'Chưa phân nhóm';

  let addr = address.normalize('NFC').trim();

  // 1. Dọn dẹp các ghi chú shipper/khách hàng ở đầu địa chỉ
  addr = addr.replace(/^[^\w\d]*(?:đchi|đ\/c|địa\s*chỉ|ship|giao|đến|tại|em\s*check\s*lại\s*thử|đc\s*nhận\s*hàng|neu\s*giao)[^:]*:\s*/i, '');
  addr = addr.replace(/^ship\s+[^,]*?\s+(?:về|đến|tại)\s+/i, '');
  addr = addr.replace(/^[^\w\d]*(?:shop|cty|công\s*ty|báo)\s+[^,]*?\s+(?=\d)/i, '');

  // 2. Chuẩn hóa lỗi chính tả và cách viết tắt tên đường phổ biến
  addr = addr.replace(/\bNTMK\b/gi, 'Nguyễn Thị Minh Khai');
  addr = addr.replace(/\b(?:Ba|Bà),?\s*Huyện\s*Thanh\s*Quan\s*(\d+)?(?:\s*Street)?\b/gi, (m, p1) => p1 ? 'Bà Huyện Thanh Quan, Q. ' + p1 : 'Bà Huyện Thanh Quan');
  addr = addr.replace(/\bBà\s+H\.\s*Thanh\s*Quan\b/gi, 'Bà Huyện Thanh Quan');
  addr = addr.replace(/\bBà\s+Huyện\s+Thanh\s+Quang\b/gi, 'Bà Huyện Thanh Quan');
  addr = addr.replace(/\bCMT8\b/gi, 'Cách Mạng Tháng 8');
  addr = addr.replace(/\bCách\s*Mạng\s*Tháng\s*(?:Tám|8)\b/gi, 'Cách Mạng Tháng 8');
  addr = addr.replace(/\b(?:3\s*tháng\s*2|3\/2)\b/gi, '3 Tháng 2');
  addr = addr.replace(/\b(?:30\s*tháng\s*4|30\/4)\b/gi, '30 Tháng 4');

  // Lỗi viết dính chữ Võ Văn Tần / gõ sai
  addr = addr.replace(/\b(?:Võ\s*v|Vo\s*v)\s*Tần\b/gi, 'Võ Văn Tần');
  addr = addr.replace(/\bVõ\s*van\s*Tân\b/gi, 'Võ Văn Tần');
  addr = addr.replace(/\bVõ\s*Văn\s*Tầng\b/gi, 'Võ Văn Tần');
  addr = addr.replace(/\bVo\s*Van\s*Tan\b/gi, 'Võ Văn Tần');

  // Khử các từ lặp lại trong địa chỉ lỗi (ví dụ: "Bà Huyện Thanh Quan 87 Ba, Huyện")
  addr = addr.replace(/Bà Huyện Thanh Quan\s+[\d\w/.-]*\s*Ba,?\s*Huyện/gi, 'Bà Huyện Thanh Quan');

  // Xử lý số nhà dính chữ: ":44 Võ Văn Tần" -> "44 Võ Văn Tần", "19võ" -> "19 Võ"
  addr = addr.replace(/^[:\s-]+/g, '');
  addr = addr.replace(/(\d+)([a-zA-ZÀ-Ỹà-ỹ]{2,})/g, '$1 $2');

  // Bỏ chữ "Việt Nam" thừa nằm giữa các dấu phẩy
  addr = addr.replace(/,\s*Việt\s*Nam\s*,/gi, ',');
  addr = addr.replace(/,\s*Việt\s*Nam\s*$/gi, '');

  // Chuẩn hóa Đ. / Đg. / Đg -> Đường
  addr = addr.replace(/\b(?:Đ\.|Đg\.|Đg)\s+/gi, 'Đường ');

  // 3. Cắt bỏ phần hành chính ở cuối (Tỉnh/TP, Quận/Huyện/Thị xã, Phường/Xã)
  addr = addr.replace(/,?\s*(?:Thành\s*phố\s*Hồ\s*Chí\s*Minh|TP\.?\s*Hồ\s*Chí\s*Minh|Hồ\s*Chí\s*Minh|TP\.?\s*HCM|TPHCM|HCM|Hồ\s*Chí\s*Minh\s*\d*|Thành\s*phố\s*Hà\s*Nội|Hà\s*Nội|Đà\s*Nẵng|Bình\s*Dương|Đồng\s*Nai|Long\s*An|Tỉnh\s+[A-ZÀ-Ỹa-zà-ỹ\s]+)\s*$/gi, '');
  addr = addr.replace(/,?\s*(?:Thị\s*xã|Thành\s*phố|TP\.?)\s+[A-ZÀ-Ỹa-zà-ỹ0-9\s]+$/gi, '');

  // Loại bỏ Quận/Huyện ở cuối (trừ khi là Bà Huyện Thanh Quan)
  if (!/Bà Huyện Thanh Quan\s*$/i.test(addr)) {
    addr = addr.replace(/,?\s*(?:Quận|Q\.?)\s*(?:\d+|[A-ZÀ-Ỹa-zà-ỹ0-9\s]+?)\s*$/gi, '');
    addr = addr.replace(/,?\s*(?:Huyện|Thị\s*xã)\s*(?:\d+|[A-ZÀ-Ỹa-zà-ỹ0-9\s]+?)\s*$/gi, '');
  }

  // Loại bỏ Phường/Xã ở cuối
  addr = addr.replace(/,?\s*(?:Phường|Xã|Thị\s*trấn|P\.?)\s*(?:\d+|[A-ZÀ-Ỹa-zà-ỹ0-9\s]+?)\s*$/gi, '');

  // Cắt các đuôi viết tắt dính liền như "p5 q3 tphcm", "p.5 q.3", "p5 quan 3", "q3 hcm"
  addr = addr.replace(/\s+(?:p\.?\s*\d+|phường\s*\d+|phuong\s*\d+)(?:\s*,?\s*(?:q\.?\s*\d+|quan\s*\d+))?(?:\s*,?\s*(?:tphcm|hcm))?\s*$/gi, '');
  addr = addr.replace(/\s+(?:q\.?\s*\d+|quan\s*\d+)(?:\s*,?\s*(?:tphcm|hcm))?\s*$/gi, '');

  // Cắt các ghi chú phụ kèm SĐT hoặc tên người nhận ở đuôi
  addr = addr.replace(/,?\s*(?:sdt|đt|tel)?\s*\d{9,11}\b.*$/i, '');

  addr = addr.trim();

  // 4. Nhận diện các tuyến đường đặc thù nếu có trong địa chỉ
  const knownStreets = [
    'Nguyễn Thị Minh Khai', 'Võ Văn Tần', 'Bà Huyện Thanh Quan', 'Điện Biên Phủ',
    'Nam Kỳ Khởi Nghĩa', 'Hai Bà Trưng', 'Hồ Xuân Hương', 'Phạm Đình Toái',
    'Lê Ngô Cát', 'Trần Quốc Thảo', 'Trương Định', 'Nguyễn Đình Chiểu',
    'Nguyễn Thông', 'Lý Chính Thắng', 'Sư Thiện Chiếu', 'Võ Thị Sáu',
    'Cách Mạng Tháng 8', 'Kha Vạn Cân', 'Lê Duẩn', 'Pasteur', 'Lý Tự Trọng',
    'Lê Lợi', 'Đồng Khởi', 'Nguyễn Du', 'Phan Chu Trinh', 'Phan Bội Châu'
  ];

  const addrNoTone = removeVietnameseTones(addr);
  for (const st of knownStreets) {
    const stNoTone = removeVietnameseTones(st);
    const reg = new RegExp('\\b' + stNoTone + '\\b', 'i');
    if (reg.test(addrNoTone)) {
      return 'Đường ' + st;
    }
  }

  // 5. Tách các phần theo dấu phẩy nếu không trúng danh mục đường đặc thù
  const parts = addr.split(',').map(p => p.trim()).filter(Boolean);

  const isHouseNumOnly = (s) => /^(?:số|nhà|hẻm|ngõ|ngách|số\s*nhà|sô)?\s*[\d/]+[a-z\d-]*$/i.test(s);
  const isBuildingPart = (s) => /(?:tòa\s*(?:nhà)?|toà\s*(?:nhà)?|chung\s*cư|cao\s*ốc|building|tower|residence|plaza|apartment)\b/i.test(s);
  const isNumberedStreet = (s) => /^(?:3\s*Tháng\s*2|30\s*Tháng\s*4|26\s*Tháng\s*3|Số\s*\d+|\d+\s*Tháng\s*\d+)/i.test(s);

  let detectedStreet = '';
  let detectedBuilding = '';

  // Ưu tiên quét từ trái sang phải để lấy đường ở gần số nhà nhất (tránh nhầm tên công ty/shop ở cuối)
  for (let i = 0; i < parts.length; i++) {
    let part = parts[i];

    if (isHouseNumOnly(part)) continue;

    // Bỏ tiền tố hẻm/ngõ/ngách: "Hẻm 450/12/3 Điện Biên Phủ" -> "Điện Biên Phủ"
    part = part.replace(/^(?:hẻm|ngõ|ngách)\s+[\d/]+[a-z\d-]*\s+(?:đường\s+)?/i, '').trim();

    // Kiểm tra có từ khóa Đường / Phố
    const mDuong = part.match(/(?:đường|phố|đ\.|đg\.)\s+([^,]+)/i);
    if (mDuong) {
      let st = mDuong[1].trim();
      st = st.replace(/(?:tòa\s*(?:nhà)?|toà\s*(?:nhà)?|chung\s*cư|cao\s*ốc|building|tower).*$/i, '').trim();
      if (st.length >= 2) {
        detectedStreet = st;
        break;
      }
    }

    // Kiểm tra số nhà ở đầu part + tên đường: "442 Nguyễn Thị Minh Khai", "6bis bà huyện Thanh quan"
    const mNumStreet = part.match(/^(?:số|nhà|sô)?\s*[\d/]+[a-z\d-]*\s+(?:đường\s+|phố\s+|đ\.\s*|đg\.\s*|đg\s+)?(.+)$/i);
    if (mNumStreet) {
      let st = mNumStreet[1].trim();
      st = st.replace(/(?:tòa\s*(?:nhà)?|toà\s*(?:nhà)?|chung\s*cư|cao\s*ốc|building|tower).*$/i, '').trim();
      if (st.length >= 2 && !/^\d+$/.test(st)) {
        detectedStreet = st;
        break;
      }
    }

    if (!isBuildingPart(part) && part.length >= 3 && !/^\d+$/.test(part)) {
      if (!detectedStreet) {
        let st = part.replace(/^(?:đường|phố|đ\.|đg\.)\s+/i, '').trim();
        st = st.replace(/(?:tòa\s*(?:nhà)?|toà\s*(?:nhà)?|chung\s*cư|cao\s*ốc|building|tower).*$/i, '').trim();
        if (st.length >= 3) {
          detectedStreet = st;
        }
      }
    }

    if (isBuildingPart(part) && !detectedBuilding) {
      detectedBuilding = part;
    }
  }

  // 6. Quyết định tên nhóm
  if (detectedStreet) {
    detectedStreet = detectedStreet.replace(/^(?:đường|phố|đ\.|đg\.)\s+/i, '').trim();
    detectedStreet = detectedStreet.replace(/^[\s,.-]+|[\s,.-]+$/g, '');
    
    if (!isNumberedStreet(detectedStreet)) {
      detectedStreet = detectedStreet.replace(/^(?:số\s+)?[\d/]+[a-z\d-]*\s+/i, '').trim();
    }

    // Bỏ các ghi chú phụ ở đuôi nếu có
    detectedStreet = detectedStreet.replace(/(?:cổng\s*\d+|bệnh\s*viện|tòa\s*nhà|chung\s*cư).*$/i, '').trim();

    if (detectedStreet.length >= 2) {
      return 'Đường ' + capitalizeWords(detectedStreet);
    }
  }

  // Nếu không tìm thấy tên đường nhưng có tên tòa nhà / chung cư
  if (detectedBuilding) {
    let bClean = detectedBuilding.replace(/^(?:số\s+)?[\d\w/.-]*\s*/i, '').trim();
    return capitalizeWords(bClean.slice(0, 30));
  }

  // Fallback: nếu chuỗi có nội dung
  if (parts.length > 0) {
    let fallback = parts[0].replace(/^(?:số\s+)?[\d\w/.-]*\s*/i, '').trim();
    if (fallback.length >= 3) {
      return 'Đường ' + capitalizeWords(fallback.slice(0, 25));
    }
  }

  return 'Chưa phân nhóm';
}

export function capitalizeWords(str) {
  if (!str) return '';
  return str.toLowerCase().split(/\s+/).map(w => w ? w.charAt(0).toUpperCase() + w.slice(1) : '').join(' ');
}

export function parseMoneyCell(cell) {
  if (!cell) return 0;
  if (typeof cell.v === 'number') return isNaN(cell.v) ? 0 : Math.round(cell.v);
  if (cell.v !== null && cell.v !== undefined && cell.v !== '') {
    const rawStr = String(cell.v).replace(/[^\d]/g, '');
    const num = parseInt(rawStr, 10);
    if (!isNaN(num)) return num;
  }
  if (cell.f) {
    const fStr = String(cell.f).replace(/[^\d]/g, '');
    const fNum = parseInt(fStr, 10);
    if (!isNaN(fNum)) return fNum;
  }
  return 0;
}

export function fetchOrdersByTrip(tripCode) {
  const cleanCode = extractTripCode(tripCode);
  if (!cleanCode) {
    return Promise.reject(new Error('Mã chuyến không hợp lệ'));
  }

  const query = "select * where C = '" + cleanCode + "'";
  const gvizUrl = 'https://docs.google.com/spreadsheets/d/' + GOOGLE_SHEET_ID + '/gviz/tq?tqx=out:json&tq=' + encodeURIComponent(query);

  return fetch(gvizUrl)
    .then(res => res.text())
    .then(text => {
      const m = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
      if (!m) throw new Error('Dữ liệu trả về không đúng định dạng');
      return JSON.parse(m[1]);
    })
    .catch(() => {
      // Fallback JSONP
      return new Promise((resolve, reject) => {
        const cbName = 'gvizCb_' + Date.now() + '_' + Math.floor(Math.random()*10000);
        const timer = setTimeout(() => {
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error('Hết thời gian chờ phản hồi Google Sheet'));
        }, 15000);

        window[cbName] = function(json) {
          clearTimeout(timer);
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          resolve(json);
        };

        const script = document.createElement('script');
        script.src = 'https://docs.google.com/spreadsheets/d/' + GOOGLE_SHEET_ID + '/gviz/tq?tqx=responseHandler:' + cbName + '&tq=' + encodeURIComponent(query);
        script.onerror = () => {
          clearTimeout(timer);
          delete window[cbName];
          if (script.parentNode) script.parentNode.removeChild(script);
          reject(new Error('Không thể kết nối đến Google Sheet'));
        };
        document.body.appendChild(script);
      });
    })
    .then(data => {
      if (!data || !data.table || !data.table.rows) {
        throw new Error('Không tìm thấy chuyến hàng');
      }
      const rows = data.table.rows;
      const mappedOrders = [];

      for (let i = 0; i < rows.length; i++) {
        const c = rows[i].c;
        if (!c) continue;

        const rawAddr = c[5] && c[5].v ? String(c[5].v) : '';
        const ward = c[6] && c[6].v ? String(c[6].v) : '';
        const district = c[7] && c[7].v ? String(c[7].v) : '';
        const city = c[8] && c[8].v ? String(c[8].v) : '';

        let fullAddr = rawAddr;
        if (ward && !fullAddr.toLowerCase().includes(ward.toLowerCase())) fullAddr += ', ' + ward;
        if (district && !fullAddr.toLowerCase().includes(district.toLowerCase())) fullAddr += ', ' + district;
        if (city && !fullAddr.toLowerCase().includes(city.toLowerCase())) fullAddr += ', ' + city;

        const pGeo = parseAndNormalizeAddress(fullAddr);
        const rawPhone = c[4] && c[4].v ? String(c[4].v).replace(/[^\d+]/g, '').trim() : '';
        const ph = extractPhone(rawPhone);
        const phaiThu = parseMoneyCell(c[11]);
        const gtbThu = parseMoneyCell(c[12]);

        const orderItem = {
          id: 'ghn_' + Date.now() + '_' + i + '_' + Math.random().toString(36).substr(2, 5),
          trackingCode: c[1] && c[1].v ? String(c[1].v).trim() : 'ĐƠN_' + (i+1),
          tripCode: cleanCode,
          customerName: c[3] && c[3].v ? String(c[3].v).replace(/[<>]/g, '').trim() : 'Khách lẻ',
          phone: ph ? ph.phone : (pGeo.secondaryPhone || rawPhone),
          secondaryPhone: pGeo.secondaryPhone,
          address: pGeo.cleanAddress || normalizeAddress(fullAddr),
          codAmount: phaiThu,
          phaiThu: phaiThu,
          gtbThu: gtbThu,
          status: 'pending',
          notes: pGeo.extraNotes || '',
          groupId: 'group_ungrouped',
          lat: c[9] && c[9].v ? Number(c[9].v) : (pGeo.landmarkCoords ? pGeo.landmarkCoords.lat : null),
          lng: c[10] && c[10].v ? Number(c[10].v) : (pGeo.landmarkCoords ? pGeo.landmarkCoords.lng : null),
          locationFingerprint: pGeo.locationFingerprint,
          hasHouseNumber: pGeo.hasHouseNumber,
          parsedGeo: pGeo,
          createdAt: new Date().toISOString()
        };

        if (pGeo.landmarkCoords && (!orderItem.lat || !orderItem.lng)) {
          orderItem.lat = pGeo.landmarkCoords.lat;
          orderItem.lng = pGeo.landmarkCoords.lng;
          orderItem.isGpsHealed = true;
          orderItem.healedSource = 'landmark_poi';
        }

        mappedOrders.push(orderItem);
      }

      // Tự động kích hoạt thuật toán nắn sửa tọa độ đa tầng
      const healStats = healTripCoordinates(mappedOrders);

      return { tripCode: cleanCode, orders: mappedOrders, healStats: healStats };
    });
}

