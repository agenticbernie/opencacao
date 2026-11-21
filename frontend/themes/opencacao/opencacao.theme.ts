// The opencacao theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in opencacao.settings.json and the generated opencacao.settings.ts;
// change them with `astryx experimental theme editor set opencacao ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {opencacaoSettings} from './opencacao.settings';

export const opencacaoTheme = defineTheme({
  extends: opencacaoSettings,
  name: 'opencacao',
});
