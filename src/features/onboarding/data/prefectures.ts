import type { Locale } from '@/lib/i18n/locale'

/** JIS prefecture code. This is what `profiles.residence_prefecture` stores. */
export type Prefecture = {
  code: string
  ja: string
  en: string
  'zh-Hans': string
}

export const PREFECTURES: readonly Prefecture[] = [
  { code: '01', ja: '北海道', en: 'Hokkaido', 'zh-Hans': '北海道' },
  { code: '02', ja: '青森県', en: 'Aomori', 'zh-Hans': '青森县' },
  { code: '03', ja: '岩手県', en: 'Iwate', 'zh-Hans': '岩手县' },
  { code: '04', ja: '宮城県', en: 'Miyagi', 'zh-Hans': '宫城县' },
  { code: '05', ja: '秋田県', en: 'Akita', 'zh-Hans': '秋田县' },
  { code: '06', ja: '山形県', en: 'Yamagata', 'zh-Hans': '山形县' },
  { code: '07', ja: '福島県', en: 'Fukushima', 'zh-Hans': '福岛县' },
  { code: '08', ja: '茨城県', en: 'Ibaraki', 'zh-Hans': '茨城县' },
  { code: '09', ja: '栃木県', en: 'Tochigi', 'zh-Hans': '栃木县' },
  { code: '10', ja: '群馬県', en: 'Gunma', 'zh-Hans': '群马县' },
  { code: '11', ja: '埼玉県', en: 'Saitama', 'zh-Hans': '埼玉县' },
  { code: '12', ja: '千葉県', en: 'Chiba', 'zh-Hans': '千叶县' },
  { code: '13', ja: '東京都', en: 'Tokyo', 'zh-Hans': '东京都' },
  { code: '14', ja: '神奈川県', en: 'Kanagawa', 'zh-Hans': '神奈川县' },
  { code: '15', ja: '新潟県', en: 'Niigata', 'zh-Hans': '新潟县' },
  { code: '16', ja: '富山県', en: 'Toyama', 'zh-Hans': '富山县' },
  { code: '17', ja: '石川県', en: 'Ishikawa', 'zh-Hans': '石川县' },
  { code: '18', ja: '福井県', en: 'Fukui', 'zh-Hans': '福井县' },
  { code: '19', ja: '山梨県', en: 'Yamanashi', 'zh-Hans': '山梨县' },
  { code: '20', ja: '長野県', en: 'Nagano', 'zh-Hans': '长野县' },
  { code: '21', ja: '岐阜県', en: 'Gifu', 'zh-Hans': '岐阜县' },
  { code: '22', ja: '静岡県', en: 'Shizuoka', 'zh-Hans': '静冈县' },
  { code: '23', ja: '愛知県', en: 'Aichi', 'zh-Hans': '爱知县' },
  { code: '24', ja: '三重県', en: 'Mie', 'zh-Hans': '三重县' },
  { code: '25', ja: '滋賀県', en: 'Shiga', 'zh-Hans': '滋贺县' },
  { code: '26', ja: '京都府', en: 'Kyoto', 'zh-Hans': '京都府' },
  { code: '27', ja: '大阪府', en: 'Osaka', 'zh-Hans': '大阪府' },
  { code: '28', ja: '兵庫県', en: 'Hyogo', 'zh-Hans': '兵库县' },
  { code: '29', ja: '奈良県', en: 'Nara', 'zh-Hans': '奈良县' },
  { code: '30', ja: '和歌山県', en: 'Wakayama', 'zh-Hans': '和歌山县' },
  { code: '31', ja: '鳥取県', en: 'Tottori', 'zh-Hans': '鸟取县' },
  { code: '32', ja: '島根県', en: 'Shimane', 'zh-Hans': '岛根县' },
  { code: '33', ja: '岡山県', en: 'Okayama', 'zh-Hans': '冈山县' },
  { code: '34', ja: '広島県', en: 'Hiroshima', 'zh-Hans': '广岛县' },
  { code: '35', ja: '山口県', en: 'Yamaguchi', 'zh-Hans': '山口县' },
  { code: '36', ja: '徳島県', en: 'Tokushima', 'zh-Hans': '德岛县' },
  { code: '37', ja: '香川県', en: 'Kagawa', 'zh-Hans': '香川县' },
  { code: '38', ja: '愛媛県', en: 'Ehime', 'zh-Hans': '爱媛县' },
  { code: '39', ja: '高知県', en: 'Kochi', 'zh-Hans': '高知县' },
  { code: '40', ja: '福岡県', en: 'Fukuoka', 'zh-Hans': '福冈县' },
  { code: '41', ja: '佐賀県', en: 'Saga', 'zh-Hans': '佐贺县' },
  { code: '42', ja: '長崎県', en: 'Nagasaki', 'zh-Hans': '长崎县' },
  { code: '43', ja: '熊本県', en: 'Kumamoto', 'zh-Hans': '熊本县' },
  { code: '44', ja: '大分県', en: 'Oita', 'zh-Hans': '大分县' },
  { code: '45', ja: '宮崎県', en: 'Miyazaki', 'zh-Hans': '宫崎县' },
  { code: '46', ja: '鹿児島県', en: 'Kagoshima', 'zh-Hans': '鹿儿岛县' },
  { code: '47', ja: '沖縄県', en: 'Okinawa', 'zh-Hans': '冲绳县' },
]

export function prefectureName(prefecture: Prefecture, locale: Locale): string {
  return prefecture[locale]
}
