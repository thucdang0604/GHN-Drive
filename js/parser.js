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

export const COMPREHENSIVE_STREETS = [
  // Tuyến đường huyết mạch Quận 3 & khu vực giao hàng GHN
  'Võ Văn Tần', 'Nguyễn Đình Chiểu', 'Cách Mạng Tháng 8', 'Trần Quốc Thảo', 
  'Cao Thắng', 'Nguyễn Gia Thiều', 'Nguyễn Thị Diệu', 'Nguyễn Sơn Hà', 
  'Nguyễn Thượng Hiền', 'Điện Biên Phủ', 'Lê Quý Đôn', 'Lý Chính Thắng',
  'Bà Huyện Thanh Quan', 'Nam Kỳ Khởi Nghĩa', 'Hai Bà Trưng', 'Hồ Xuân Hương',
  'Phạm Đình Toái', 'Lê Ngô Cát', 'Trương Định', 'Nguyễn Thông', 'Sư Thiện Chiếu',
  'Võ Thị Sáu', 'Nguyễn Thiện Thuật', 'Bàn Cờ', 'Vườn Chuối', 'Lê Văn Sỹ',
  'Kỳ Đồng', 'Rạch Bùng Binh', 'Trần Văn Đang', 'Trương Quyền', 'Phạm Ngọc Thạch',
  'Pasteur', 'Trần Quang Diệu', 'Huỳnh Tịnh Của', 'Lý Thái Tổ',
  'Trần Cao Vân', 'Công Trường Quốc Tế', 'Ngô Thời Nhiệm', 'Trần Quốc Toản',
  'Tú Xương', 'Nguyễn Văn Mai', 'Đoàn Công Bửu', 'Trần Quang Khải',

  // Quận 1 & lân cận
  'Nguyễn Thị Minh Khai', 'Lê Duẩn', 'Đồng Khởi', 'Nguyễn Huệ', 'Lê Lợi',
  'Lý Tự Trọng', 'Hàm Nghi', 'Bến Vân Đồn', 'Tôn Đức Thắng', 'Đinh Tiên Hoàng',
  'Nguyễn Du', 'Phan Chu Trinh', 'Phan Bội Châu', 'Mạc Đĩnh Chi', 'Phùng Khắc Khoan',
  'Thạch Thị Thanh', 'Mai Thị Lựu', 'Nguyễn Văn Thủ', 'Nguyễn Bỉnh Khiêm',
  'Hoàng Sa', 'Trường Sa', 'Cống Quỳnh', 'Bùi Viện', 'Phạm Ngũ Lão', 'Đề Thám',
  'Trần Hưng Đạo', 'Nguyễn Thái Học', 'Calmette', 'Ký Con', 'Yersin',
  'Công Xã Paris', 'Công Trường Lam Sơn', 'Công Trường Mê Linh',

  // Quận 10 & Tân Bình & Bình Thạnh
  '3 Tháng 2', 'Tô Hiến Thành', 'Thành Thái', 'Sư Vạn Hạnh', 'Ngô Gia Tự',
  'Lê Hồng Phong', 'Vĩnh Viễn', 'Nguyễn Tri Phương', 'Hùng Vương', 'Hồng Bàng',
  'Nguyễn Chí Thanh', 'Bạch Đằng', 'Phan Đăng Lưu', 'Hoàng Văn Thụ', 'Cộng Hòa',
  'Trường Chinh', 'Lạc Long Quân', 'Âu Cơ', 'Lê Đại Hành', 'Kha Vạn Cân'
];

export function cleanAddressForClustering(raw) {
  if (!raw) return '';
  let addr = String(raw).normalize('NFC').trim();

  // 1. Dọn dẹp SĐT nhúng
  addr = addr.replace(/(?:\+?84|0|\(\+?84\)|\(0\d{1,4}\))[\s.-]*\d(?:[\s.-]*\d){4,10}\b/g, ' ');

  // 2. Dọn dẹp ghi chú trong ngoặc đơn hoặc tiền tố shipper/shop
  addr = addr.replace(/\([^)]*\)/g, ' ');
  addr = addr.replace(/^[^\w\d]*(?:đchi|đ\/c|địa\s*chỉ|ship|giao|đến|tại|em\s*check\s*lại\s*thử|đc\s*nhận\s*hàng|neu\s*giao|đc|dc)[^:]*:\s*/i, '');
  addr = addr.replace(/^ship\s+[^,]*?\s+(?:về|đến|tại)\s+/i, '');
  addr = addr.replace(/^[-–—\s*#]+/g, '');
  addr = addr.replace(/^[^\w\d]*(?:shop|cty|công\s*ty|báo|toà\s*nhà|tòa\s*nhà|building|tower|chi\s*nhánh|cn|nhà\s*hàng|coffe|cafe|viện|bv|bệnh\s*viện)\s+[^,]*?,\s*(?=\d)/i, '');
  addr = addr.replace(/^[^\w\d]*(?:shop|cty|công\s*ty|báo|toà\s*nhà|tòa\s*nhà|building|tower|chi\s*nhánh|cn|cổng\s*số\s*\d+)\s+[^,]*?\s+(?=\d)/i, '');

  // Loại bỏ từ khóa phường trùng tên đường (như Phường Võ Thị Sáu) để không làm sai lệch nhận diện đường
  const addrCheck = addr.replace(/(?:phường|p\.|p\s+|f\.?)\s*(?:võ\s*thị\s*sáu|nguyễn\s*cư\s*trinh|phạm\s*ngũ\s*lão)\b/gi, ' ');

  // 3. Chuẩn hóa địa danh / toà nhà nổi tiếng (chỉ bổ sung nếu chưa có tên đường trong địa chỉ)
  let hasStreetAlready = false;
  const tempNoTone = removeVietnameseTones(addrCheck);
  for (const stItem of COMPREHENSIVE_STREETS) {
    if (new RegExp('\\b' + removeVietnameseTones(stItem) + '\\b', 'i').test(tempNoTone)) {
      hasStreetAlready = true;
      break;
    }
  }

  if (!hasStreetAlready) {
    if (/master\s*building/i.test(addr)) {
      addr = '41-43 Trần Cao Vân, ' + addr;
    } else if (/an\s*ph[uú]\s*plaza/i.test(addr)) {
      addr = '117 Lý Chính Thắng, ' + addr;
    } else if (/ns\s*t[aâ]n\s*đ[iị]nh|nh[aà]\s*s[aá]ch\s*t[aâ]n\s*đ[iị]nh/i.test(addr)) {
      addr = '387 Hai Bà Trưng, ' + addr;
    } else if (/b(?:v|ệnh\s*viện)\s*da\s*li[eễ]u/i.test(addr)) {
      addr = '69b Ngô Thời Nhiệm, ' + addr;
    } else if (/b(?:v|ệnh\s*viện)\s*y\s*h[oọ]c\s*c[oổ]\s*truy[eề]n/i.test(addr)) {
      addr = '179 Nam Kỳ Khởi Nghĩa, ' + addr;
    } else if (/sawaco|daikin|h[oồ]\s*con\s*r[uù]a/i.test(addr)) {
      addr = 'Công Trường Quốc Tế, ' + addr;
    }
  }

  // 4. Chuẩn hóa viết tắt tên đường phổ biến
  addr = addr.replace(/\bCMT8\b/gi, 'Cách Mạng Tháng 8');
  addr = addr.replace(/\bcm\s*th[aá]ng\s*8\b/gi, 'Cách Mạng Tháng 8');
  addr = addr.replace(/\bC[aá]ch\s*M[aạ]ng\s*T(?:8|ám)\b/gi, 'Cách Mạng Tháng 8');
  addr = addr.replace(/\bCách\s*Mạng\s*Tháng\s*(?:Tám|8)\b/gi, 'Cách Mạng Tháng 8');
  addr = addr.replace(/\bNTMK\b/gi, 'Nguyễn Thị Minh Khai');
  addr = addr.replace(/\b(?:Võ|Vo)\s*(?:v|văn|van)?\s*(?:tần|tan|tang|tầng)\b/gi, 'Võ Văn Tần');
  addr = addr.replace(/\bVO\s*V\s*TANG\b/gi, 'Võ Văn Tần');
  addr = addr.replace(/\b(?:3\s*tháng\s*2|3\/2)\b/gi, '3 Tháng 2');

  // Nam Kỳ Khởi Nghĩa và các biến thể
  addr = addr.replace(/\bNam\s*K[iì]\s*(?:Kh[oở]i\s*Ngh[iĩ]a)?\b/gi, 'Nam Kỳ Khởi Nghĩa');
  addr = addr.replace(/\bn\s*k\s*kh[oở]i\s*n[fgh]+[iĩ]a[x]?\b/gi, 'Nam Kỳ Khởi Nghĩa');

  // Phạm Ngọc Thạch gõ nhầm thành Phạm Ngọc Thạnh
  addr = addr.replace(/\bPhạm\s*Ngọc\s*Thạnh\b/gi, 'Phạm Ngọc Thạch');
  addr = addr.replace(/\bpham\s*ngoc\s*thanh\b/gi, 'Phạm Ngọc Thạch');

  // Công Trường Quốc Tế không dấu
  addr = addr.replace(/\bcong\s*truong\s*quoc\s*te\b/gi, 'Công Trường Quốc Tế');

  // Tú Xương
  addr = addr.replace(/\btu\s*xuong\b/gi, 'Tú Xương');

  // Lỗi gõ sai khác
  const rawNoTone = removeVietnameseTones(addr);
  if (rawNoTone.includes('xuan ha') && (rawNoTone.includes('p5') || rawNoTone.includes('phuong 5') || rawNoTone.includes('q3') || rawNoTone.includes('quan 3'))) {
    addr = addr.replace(/xuan\s*ha/gi, 'Sơn Hà').replace(/xuân\s*hà/gi, 'Sơn Hà');
  }
  if (rawNoTone.includes('nguyen gia thieu')) {
    addr = addr.replace(/nguy[eên\s]*gia\s*thi[eêú]+/gi, 'Nguyễn Gia Thiều');
  }
  if (rawNoTone.includes('nguyen thuong hien')) {
    addr = addr.replace(/nguy[eên\s]*th[uưoơng\s]*hi[eên]+/gi, 'Nguyễn Thượng Hiền');
  }

  // 5. Chuẩn hóa số nhà có từ "Số", "sn", "So" ở đầu
  addr = addr.replace(/^(?:đc|đ\/c|địa\s*chỉ)?\s*(?:số|nhà|số\s*nhà|sô|sn|so)\s*[:\s]*([\d/]+[a-zA-Z]*(?:\s*bis)?)\s*[,.\s]+/i, '$1 ');

  // Xử lý số nhà dạng kép: "41 43 Trần Cao Vân" -> "41-43 Trần Cao Vân", "71 73 Ngô Thời Nhiệm" -> "71-73 Ngô Thời Nhiệm"
  addr = addr.replace(/^(\d+)\s+(\d+)\s+(?=[A-ZÀ-Ỹa-zà-ỹ])/i, '$1-$2 ');

  // Xử lý số nhà lặp lại: "30/4 30/4 Ngô Thời Nhiệm" -> "30/4 Ngô Thời Nhiệm"
  addr = addr.replace(/^([\d/]+[a-zA-Z]*)\s+\1\s+/i, '$1 ');

  // 6. Chuẩn hóa trường hợp tên đường lặp trước số nhà
  for (const stItem of COMPREHENSIVE_STREETS) {
    const escSt = stItem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regRepeat = new RegExp('^\\s*(?:đường|phố)?\\s*' + escSt + '\\s+([\\d/]+[a-zA-Z]*(?:\\s*bis)?)\\s+(?:đường|phố)?\\s*' + escSt, 'i');
    if (regRepeat.test(addr)) {
      addr = addr.replace(regRepeat, '$1 ' + stItem);
    }
    const regPrefix = new RegExp('^\\s*(?:đường|phố)?\\s*' + escSt + '\\s+([\\d/]+[a-zA-Z]*(?:\\s*bis)?)(.*)$', 'i');
    const mP = addr.match(regPrefix);
    if (mP) {
      addr = mP[1] + ' ' + stItem + (mP[2] ? ' ' + mP[2] : '');
    }
  }

  // 7. Xử lý số nhà bằng chữ
  addr = addr.replace(/\bsố\s*năm\b/gi, '5');
  addr = addr.replace(/\bsố\s*một\b/gi, '1');

  // 8. Xử lý số nhà dính chữ: "220võ" -> "220 Võ", "39tu Xương" -> "39 Tú Xương"
  addr = addr.replace(/(\d+)([a-zA-ZÀ-Ỹà-ỹ]{2,})/g, '$1 $2');

  // 9. Cắt sạch các đuôi hành chính lộn xộn ở cuối
  addr = addr.replace(/,\s*(?:Phường|P\.?|F\.?)\s*(?:\d+|[A-ZÀ-Ỹa-zà-ỹ0-9\s]+?)(?:,\s*(?:Quận|Q\.?)\s*(?:\d+|[A-ZÀ-Ỹa-zà-ỹ0-9\s]+?))?(?:,\s*(?:TP\.?|Thành phố|Hồ Chí Minh|HCM|TPHCM)[^,]*)?$/gi, '');
  addr = addr.replace(/\s+(?:p\.?\s*\d+|phường\s*\d+|f\d+)(?:\s*,?\s*(?:q\.?\s*\d+|quan\s*\d+))?(?:\s*,?\s*(?:tphcm|hcm))?\s*$/gi, '');
  addr = addr.replace(/\s+(?:q\.?\s*\d+|quan\s*\d+)(?:\s*,?\s*(?:tphcm|hcm))?\s*$/gi, '');

  return addr.replace(/\s{2,}/g, ' ').trim();
}

export function extractClusterName(address, ward, district) {
  if (!address) return 'Chưa phân nhóm';

  const clean = cleanAddressForClustering(address);
  const addrNoTone = removeVietnameseTones(clean);

  // 1. Quét theo danh mục đường chuẩn (sắp xếp dài trước ngắn sau)
  const sortedStreets = COMPREHENSIVE_STREETS.slice().sort((a, b) => b.length - a.length);
  for (const st of sortedStreets) {
    const stNoTone = removeVietnameseTones(st);
    const reg = new RegExp('\\b' + stNoTone + '\\b', 'i');
    if (reg.test(addrNoTone)) {
      return 'Đường ' + st;
    }
  }

  // 2. Tìm theo từ khóa Đường / Phố
  const mDuong = clean.match(/(?:đường|phố|đ\.|đg\.)\s+([^,]+)/i);
  if (mDuong) {
    let stFound = mDuong[1].trim();
    stFound = stFound.replace(/(?:tòa\s*(?:nhà)?|toà\s*(?:nhà)?|chung\s*cư|cao\s*ốc|building|tower).*$/i, '').trim();
    stFound = stFound.replace(/\s+(?:thuộc|ở|tại)?\s*(?:p\.?\s*\d+|phường\s*\d+|f\d+|q\.?\s*\d+|quan\s*\d+).*$/i, '').trim();
    stFound = stFound.replace(/[-–—.,\s]+$/g, '').trim();
    if (stFound.length >= 2 && !/^(?:hồ chí minh|tphcm|vietnam|việt nam)$/i.test(stFound)) {
      return 'Đường ' + capitalizeWords(stFound);
    }
  }

  // 3. Fallback: Lấy phần tên đường ngay sau số nhà
  const mNum = clean.match(/^(?:số\s*)?[\d/]+(?:-[\d/]+)?[a-zA-Z]*(?:\s*bis)?\s*[,.\s]+\s*([^,]+)/i);
  if (mNum) {
    let stAfterNum = mNum[1].trim();
    stAfterNum = stAfterNum.replace(/\s+(?:thuộc|ở|tại)?\s*(?:p\.?\s*\d+|phường\s*\d+|f\d+|q\.?\s*\d+|quan\s*\d+).*$/i, '').trim();
    stAfterNum = stAfterNum.replace(/[-–—.,\s]+$/g, '').trim();
    if (stAfterNum.length >= 2 && !/^(?:hồ chí minh|tphcm|vietnam|việt nam)$/i.test(stAfterNum)) {
      return 'Đường ' + capitalizeWords(stAfterNum);
    }
  }

  // 4. Nếu chỉ có Phường / Quận mà không có tên đường
  if (ward || district) {
    const area = [];
    if (ward) area.push(ward.startsWith('Phường') || ward.startsWith('P.') ? ward : 'Phường ' + ward);
    if (district) area.push(district.startsWith('Quận') || district.startsWith('Q.') ? district : 'Quận ' + district);
    return area.join(', ');
  }

  return 'Chưa phân nhóm';
}

export function extractStreetAndHouseNumber(addr) {
  if (!addr) {
    return { street: 'Chưa rõ đường', clusterGroup: 'Chưa phân nhóm', houseNumber: '', houseNumVal: 999999, shortStreet: '' };
  }

  const streetRaw = extractClusterName(addr);
  const street = streetRaw.replace(/^Đường\s+/i, '').trim();

  // Tạo tên đường viết tắt gọn gàng (ví dụ Nguyễn Thị Minh Khai -> NTMK, Pasteur -> Pasteur)
  const words = street.split(/\s+/).filter(Boolean);
  const shortStreet = words.length > 2 
    ? words.map(w => w.charAt(0).toUpperCase()).join('')
    : street;

  let s = String(addr).trim();
  s = s.replace(/(?:\+?84|0|\(\+?84\)|\(0\d{1,4}\))[\s.-]*\d(?:[\s.-]*\d){4,10}\b/g, ' ');
  s = s.replace(/\([^)]*\)/g, ' ');
  s = s.replace(/^(?:địa\s*chỉ\s*(?:giao|nhận)?|đ\/c|address)\s*:\s*/i, '');
  s = s.replace(/(?:tầng|lầu|phòng|p\.|căn\s*hộ|block|lô)\s*[\d\w-]+\s*,?\s*/gi, '');
  s = s.replace(/(\d+)([a-zA-ZÀ-Ỹà-ỹ]{2,})/g, '$1 $2');

  const streetEsc = street.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let houseNumber = '';

  // Trường hợp tên đường lặp trước số nhà: "Võ Văn Tần 221/27"
  const regRepeat = new RegExp('^\\s*(?:đường|phố)?\\s*' + streetEsc + '\\s+([\\d/]+[a-zA-Z]*(?:\\s*bis)?)(?:\\D|$)', 'i');
  const mRepeat = s.match(regRepeat);
  if (mRepeat) {
    houseNumber = mRepeat[1].trim();
  } else {
    // Trường hợp số nhà nằm ngay trước tên đường: "Lầu 6, TSA Building, 30 Nguyễn Thị Diệu"
    const regBefore = new RegExp('(?:^|[,\\s])([\\d/]+[a-zA-Z]*(?:\\s*bis)?)\\s*(?:đường|phố)?\\s*' + streetEsc, 'i');
    const mBefore = s.match(regBefore);
    if (mBefore) {
      houseNumber = mBefore[1].trim();
    } else {
      // Cắt tiền tố "Số", "Số nhà"
      const sClean = s.replace(/^(?:đc|đ\/c|địa\s*chỉ)?\s*(?:số|nhà|số\s*nhà|sô)\s*[:\s]*/i, '');
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
    street: street,
    clusterGroup: streetRaw,
    houseNumber: houseNumber,
    houseNumVal: houseNumVal,
    shortStreet: shortStreet
  };
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

