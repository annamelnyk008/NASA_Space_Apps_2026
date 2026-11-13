// Форматирование координат и времени для интерфейса.

export function lonText(lon) {
  if (lon === 0) return '0°';
  if (lon === 180 || lon === -180) return '180°';
  return Math.abs(lon) + '°' + (lon > 0 ? 'E' : 'W');
}

export function pad2(n) { return (n < 10 ? '0' : '') + n; }
export function fmtLonLat(lonE, lat) {
  var lo = Math.abs(lonE).toFixed(0) + '°' + (lonE >= 0 ? 'E' : 'W');
  var la = Math.abs(lat).toFixed(0) + '°' + (lat >= 0 ? 'N' : 'S');
  return lo + ' ' + la;
}

export function fmtClock(h) {
  h = ((h % 24) + 24) % 24;
  var hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return pad2(hh) + ':' + pad2(mm);
}
