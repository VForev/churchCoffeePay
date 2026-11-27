/**
 * Which picture shows where, and that nothing but a picture address reaches the page.
 *
 * `npm run test:pictures`
 *
 * The rules in pictures.ts are read by the menu, the tablet, the drink sheet, checkout and
 * the drink of the day. If they drift, a drink has a photo on one screen and a cup on the
 * next; if safeImageUrl() loosens, an admin-pasted link can close the CSS `url("…")` it is
 * put in.
 */

import {
  DEFAULT_PICTURES,
  cssImage,
  drinkPhoto,
  drinkPicture,
  picturesFromRow,
  safeImageUrl,
  specialtyPicture,
  type SitePictures,
} from './pictures';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failures++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
}

const PHOTO = 'https://cdn.example.com/latte.webp';
const DEFAULT_IMG = 'https://cdn.example.com/cup.webp';
const withPhoto = { image_url: PHOTO };
const without = { image_url: null };
const mode = (drink_mode: SitePictures['drink_mode'], default_drink_image: string | null = DEFAULT_IMG): SitePictures => ({
  ...DEFAULT_PICTURES,
  drink_mode,
  default_drink_image,
});

console.log('\nOnly picture addresses get through');
check('https link kept', safeImageUrl(PHOTO) === PHOTO);
check('http link kept', safeImageUrl('http://example.com/a.png') === 'http://example.com/a.png');
check('a path on this site kept', safeImageUrl('/lotg-logo.png') === '/lotg-logo.png');
check('whitespace trimmed', safeImageUrl(`  ${PHOTO}  `) === PHOTO);
check('javascript: refused', safeImageUrl('javascript:alert(1)') === null);
check('data: refused', safeImageUrl('data:image/svg+xml;base64,PHN2Zz4=') === null);
check('protocol-relative refused', safeImageUrl('//evil.example/x.png') === null);
check('nonsense refused', safeImageUrl('not a link') === null);
check('empty is no picture', safeImageUrl('') === null && safeImageUrl(null) === null && safeImageUrl(42) === null);

const hostile = cssImage('https://x.example/a.png"); } body { display:none } a { b: url("');
check('a quote in a link cannot close url("…")', !/"\)\s*;?\s*}/.test(hostile) && hostile.startsWith('url("') && hostile.endsWith('")') && (hostile.match(/"/g) ?? []).length === 2, hostile);
check('a bad link is no background, not a broken one', cssImage('javascript:alert(1)') === 'none' && cssImage(null) === 'none');

console.log('\nWhat a drink shows');
check('its own photo, in every mode but "none"', (['icon', 'default'] as const).every((m) => {
  const p = drinkPicture(withPhoto, mode(m));
  return p.kind === 'photo' && p.url === PHOTO;
}));
check('"none" hides even a drink that has a photo', drinkPicture(withPhoto, mode('none')).kind === 'none');
check('no photo + "icon" → cup', drinkPicture(without, mode('icon')).kind === 'icon');
check('no photo + "default" → our picture', (() => {
  const p = drinkPicture(without, mode('default'));
  return p.kind === 'photo' && p.url === DEFAULT_IMG;
})());
check('"default" with no picture chosen yet → cup, not a blank', drinkPicture(without, mode('default', null)).kind === 'icon');
check('a broken stored link → cup, not a torn image', drinkPicture({ image_url: 'javascript:x' }, mode('icon')).kind === 'icon');
check('drinkPhoto never returns the cup', drinkPhoto(without, mode('icon')) === null && drinkPhoto(withPhoto, mode('icon')) === PHOTO);

console.log('\nThe drink of the day');
const SPECIAL = 'https://cdn.example.com/maple.webp';
check('its own picture first', specialtyPicture({ image_url: SPECIAL }, withPhoto, mode('icon')) === SPECIAL);
check('its own picture even with "No pictures" on the menu', specialtyPicture({ image_url: SPECIAL }, withPhoto, mode('none')) === SPECIAL);
check('else the drink it is built on', specialtyPicture({ image_url: null }, withPhoto, mode('icon')) === PHOTO);
check('else our default picture', specialtyPicture({ image_url: null }, without, mode('default')) === DEFAULT_IMG);
check('else nothing — the card as it always was', specialtyPicture({ image_url: null }, without, mode('icon')) === null);
check('borrowing respects "No pictures"', specialtyPicture({ image_url: null }, withPhoto, mode('none')) === null);

console.log('\nStored settings are filtered on the way in');
check('no row → how the app always looked', JSON.stringify(picturesFromRow(null)) === JSON.stringify(DEFAULT_PICTURES));
check('an unknown mode → cup', picturesFromRow({ drink_mode: 'sparkles' }).drink_mode === 'icon');
check('a bad banner link → no banner picture', picturesFromRow({ banner_image: 'javascript:x' }).banner_image === null);
check('good values survive', (() => {
  const p = picturesFromRow({ drink_mode: 'default', default_drink_image: DEFAULT_IMG, live_background_image: PHOTO });
  return p.drink_mode === 'default' && p.default_drink_image === DEFAULT_IMG && p.live_background_image === PHOTO;
})());

console.log(failures === 0 ? '\nAll picture checks passed.' : `\n${failures} picture check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
