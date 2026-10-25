import { injectGlobal } from '@emotion/css';
import regularFont from '../assets/fonts/noto-sans-2.007-regular.woff2';

// Scope the reference font to Flame Graph; do not change the host's NotoSans alias.
injectGlobal({
  '@font-face': {
    fontFamily: 'Trace Flame Noto Sans',
    fontStyle: 'normal',
    fontWeight: 400,
    fontDisplay: 'swap',
    src: `url("${regularFont}") format("woff2")`,
  },
});

export const flameRegularFont = '"Trace Flame Noto Sans", sans-serif';
// The reference canvas's remap alias is absent on the measured Mac page:
// its bold name resolves to Lucida Grande, separately from NotoSans duration text.
export const flameNameFont = '"NotoSans Semibold Remap", "Lucida Grande", "Lucida Sans Unicode", sans-serif';
