/** 画面に出すときの伏せ字。「表示」を押すまではこの形で出す */
export function maskName(v: string | null): string {
  if (!v) return "";
  const chars = [...v.replace(/\s+/g, "")];
  return chars.length <= 1 ? "＊" : `${chars[0]}${"＊".repeat(Math.min(chars.length - 1, 4))}`;
}

export function maskPhone(v: string | null): string {
  if (!v) return "";
  const digits = v.replace(/[^0-9]/g, "");
  return digits.length < 4 ? "＊＊＊＊" : `＊＊＊-＊＊＊＊-${digits.slice(-4)}`;
}

export function maskEmail(v: string | null): string {
  if (!v) return "";
  const at = v.indexOf("@");
  if (at < 1) return "＊＊＊";
  return `${v.slice(0, Math.min(2, at))}＊＊＊${v.slice(at)}`;
}

export function maskPostal(v: string | null): string {
  if (!v) return "";
  return `${v.replace(/[^0-9]/g, "").slice(0, 3)}-＊＊＊＊`;
}

/** 住所は都道府県と市区町村まで（番地・建物は出さない） */
export function maskAddress(v: string | null): string {
  if (!v) return "";
  const m = v.match(/^(.{2,3}?[都道府県])(.+?[市区町村郡])/);
  return m ? `${m[1]}${m[2]}＊＊＊` : `${[...v].slice(0, 4).join("")}＊＊＊`;
}
