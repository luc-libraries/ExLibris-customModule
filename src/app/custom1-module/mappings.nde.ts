// =====================================================================
// Loyola NDE view — feature registrations
// =====================================================================
// `scripts.mjs activate('LUC_NDE')` symlinks this file in as
// `customComponentMappings.ts` so the Angular build picks it up.
//
// LAW and HSL have their own sibling files (`mappings.law.ts`,
// `mappings.hsl.ts`). The three evolve independently — add or remove
// feature registrations here without affecting other views.

import { TryMySearchComponent } from '../luc-features/try-my-search/try-my-search.component';
import { ChatComponent } from '../luc-features/chat/chat.component';

export const selectorComponentMap = new Map<string, any>([
  ['nde-search-results-after', TryMySearchComponent],
  ['nde-user-area-after',      ChatComponent],
]);
