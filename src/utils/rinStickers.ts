import { publicEnv } from '@/app/config/env';
export type RinSticker = {
  id: string;
  token: string;
  label: string;
  filename: string;
};

const publicBase = publicEnv.publicBasePath || '';

export const rinStickers: RinSticker[] = [
  { id: 'happy', token: ':rin_happy:', label: '开心', filename: '01_happy.png' },
  { id: 'confused', token: ':rin_confused:', label: '困惑', filename: '02_confused.png' },
  { id: 'angry', token: ':rin_angry:', label: '生气', filename: '03_angry.png' },
  { id: 'love', token: ':rin_love:', label: '喜欢', filename: '04_love.png' },
  { id: 'cry', token: ':rin_cry:', label: '哭', filename: '05_cry.png' },
  { id: 'laugh', token: ':rin_laugh:', label: '笑', filename: '06_laugh.png' },
  { id: 'wow', token: ':rin_wow:', label: '惊讶', filename: '07_wow.png' },
  { id: 'sad', token: ':rin_sad:', label: '难过', filename: '08_sad.png' },
  { id: 'cry_alt', token: ':rin_cry_alt:', label: '流泪', filename: '09_cry_alt.png' },
  { id: 'smile_alt', token: ':rin_smile_alt:', label: '微笑', filename: '10_smile_alt.png' },
  { id: 'wow_alt', token: ':rin_wow_alt:', label: '震惊', filename: '11_wow_alt.png' },
  { id: 'no', token: ':rin_no:', label: '拒绝', filename: '12_no.png' },
];

export function rinStickerSrc(sticker: RinSticker) {
  return `${publicBase}/assets/rin-stickers/${sticker.filename}`;
}

export function rinStickerByToken(token: string) {
  return rinStickers.find((item) => item.token === token) || null;
}

export function appendRinStickerToken(value: string, token: string) {
  const trimmedRight = value.replace(/\s+$/, '');
  return `${trimmedRight}${trimmedRight ? ' ' : ''}${token} `;
}
