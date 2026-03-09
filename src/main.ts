// eslint-disable-next-line import-x/no-unassigned-import, import-x/no-empty-named-blocks -- Need to enable obsidian-typings.
import type {} from 'obsidian-typings';

import './styles/main.scss';
import { Plugin } from './plugin.ts';

// eslint-disable-next-line import-x/no-default-export -- Obsidian infrastructure requires a default export.
export default Plugin;
