import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd } from '@angular/router';
import { Subscription, filter } from 'rxjs';

import { SHELL_ROUTER } from '../../injection-tokens';
import { AssetBaseService } from '../../services/asset-base.service';
import {
  parsePrimoQuery,
  spaceToPlus,
  PrimoQuery,
  PrimoClause,
} from '../_shared/primo-query';

// =====================================================================
// Configuration
// =====================================================================
// All institutional values and field mappings live in this one object,
// which forms the seam for eventual add-on extraction. When shipping
// as a CARLI-shareable add-on, CONFIG gets replaced by MODULE_PARAMETERS
// injection — everything below moves to the add-on unchanged.

const CONFIG = {

  // --- Which systems to show -----------------------------------------
  // Flip a key to `false` to hide that link without removing the
  // integration. To add a new system, register an id here and a
  // matching entry in SYSTEMS below.
  enabled: {
    academicSearchComplete: true,
    mlaInternationalBibliography: true,
    googleScholar: true,
    worldcat: true,
    hathitrust: true,
    jstor: true,
    internetArchive: true,
    pubmed: true,
    wikipedia: true,
  },

  // --- EBSCOhost -----------------------------------------------------
  // The `bquery` parameter accepts EBSCO's field-tag syntax:
  //   TI+(war)+AND+AU+(tolstoy)
  // EBSCO field codes used below: TI=Title, AU=Author, SU=Subject,
  // AB=Abstract, IB=ISBN, IS=ISSN. Unmapped Primo fields fall through
  // to bare parens, which EBSCO treats as a keyword search.
  ebsco: {
    base: 'https://search.ebscohost.com/login.aspx?direct=true&scope=site&site=ehost-live&lang=en&authtype=ip,shib&custid=s8448101',
    databases: {
      academicSearchComplete: 'a9h',
      mlaInternationalBibliography: 'mlf',
    },
    fieldPrefix: {
      title:    'TI',  // Primo: Title
      addtitle: 'TI',  // Primo: Additional Title       → fold into Title
      alttitle: 'TI',  // Primo: Alternate Title        → fold into Title
      creator:  'AU',  // Primo: Author / Creator
      sub:      'SU',  // Primo: Subject
      desc:     'AB',  // Primo: Description            → nearest EBSCO eq.
      abstract: 'AB',  // Primo: Abstract
      isbn:     'IB',  // Primo: ISBN
      issn:     'IS',  // Primo: ISSN
    } as Record<string, string>,
  },

  // --- WorldCat (Loyola-branded) -------------------------------------
  // Discovery uses `prefix:value` lowercase tags separated by spaces;
  // multiple clauses are implicitly AND-ed. We URL-encode with `%20`
  // rather than `+` because WorldCat treats `+` as a literal character
  // in queryString. We do not emit explicit AND/OR/NOT — WorldCat's
  // tokenizer is case-insensitive about operators, which collides with
  // terms that happen to contain words like "Not" or "and". Primo
  // exclusion semantics (NOT-joined clauses) are handled by dropping
  // the excluded clause in convertToWorldCat rather than risking a
  // misparse.
  // Field prefixes: ti=Title, au=Author, su=Subject, kw=Keyword,
  // bn=ISBN, in=ISSN.
  worldcat: {
    base: 'https://luclibrary.on.worldcat.org/search?queryString=',
    fieldPrefix: {
      title:    'ti:',
      addtitle: 'ti:',
      alttitle: 'ti:',
      creator:  'au:',
      sub:      'su:',
      isbn:     'bn:',
      issn:     'in:',
    } as Record<string, string>,
  },

  // --- Google Scholar ------------------------------------------------
  // Scholar has no field syntax — every clause becomes a parenthesized
  // keyword group, joined with the user's chosen conjunctions.
  googleScholar: {
    base: 'https://scholar.google.com/scholar?hl=en&as_sdt=0%2C33&inst=2260701086060488346&q=',
  },

  // --- Keyword-only systems ------------------------------------------
  // These accept a bare keyword query (no field syntax). We collapse
  // advanced searches to keywords via convertToKeywords. If any URL
  // format proves wrong in practice, only the `base` here changes.
  hathitrust:      { base: 'https://catalog.hathitrust.org/Search/Home?type=all&lookfor=' },
  jstor:           { base: 'https://www.jstor.org/action/doBasicSearch?Query=' },
  internetArchive: { base: 'https://archive.org/search?query=' },
  pubmed:          { base: 'https://pubmed.ncbi.nlm.nih.gov/?term=' },
  wikipedia:       { base: 'https://en.wikipedia.org/wiki/Special:Search?search=' },

  // --- Primo NDE query parsing ---------------------------------------
  // Primo's documented searchable field codes (we keep these, mapping
  // to a third-party prefix above where one exists, falling through
  // to keyword search otherwise):
  //   any, title, addtitle, alttitle, swstitle, creator, sub, desc,
  //   abstract, toc, ftext, general, fiction, isbn, issn, rtype,
  //   rectype, pnxtype, fmt, lang, cdate, sid, rid, addsrcrid, dlink
  //
  // Primo's documented facet fields (always dropped — detected by the
  // `facet_` prefix below):
  //   facet_creator, facet_lang, facet_rtype, facet_pfilter,
  //   facet_topic, facet_creationdate, facet_dcc, facet_lcc,
  //   facet_rvk, facet_tlevel, facet_domain, facet_fsize, facet_fmt,
  //   facet_frbrgroupid, facet_frbrtype, facet_local1…50
  //
  // `extraFilterFields` covers UI-applied refinements that show up as
  // bare clauses (not `facet_*`) but functionally narrow results
  // rather than express search intent. We strip these before
  // translating, since EBSCO/WorldCat/Scholar can't usefully consume
  // Primo's filter codes.
  //
  // Reference: https://developers.exlibrisgroup.com/primo/apis/deeplinks/brief/
  primo: {
    extraFilterFields: new Set([
      'lang',       // Language refinement
      'rtype',      // Resource type
      'fmt',        // Format
      'rectype',    // Record type
      'pnxtype',    // PNX type
      'cdate',      // Creation date (use facet_creationdate / dr_s,e instead)
      'dr_s',       // NDE: date range start
      'dr_e',       // NDE: date range end
      'user_tags',  // NDE: My Tags
      'ftext',      // Full-text-only toggle
      'fiction',    // Fiction-only toggle
      'sid',        // Primo-internal: source ID
      'rid',        // Primo-internal: record ID
      'addsrcrid',  // Primo-internal: additional source ID
      'dlink',      // Primo-internal: download link
      'swstitle',   // Sort-only field (begins_with)
    ]),
  },

};

// =====================================================================
// External systems
// =====================================================================
// Order in this array = order links appear in the UI.

interface ExternalSystem {
  id: keyof typeof CONFIG.enabled;
  label: string;
  icon: string;
  buildUrl: (query: PrimoQuery) => string;
}

const SYSTEMS: ExternalSystem[] = [
  {
    id: 'academicSearchComplete',
    label: 'Academic Search Complete',
    icon: 'assets/images/external/icon_brands/icon_ebsco.svg',
    buildUrl: q =>
      `${CONFIG.ebsco.base}&db=${CONFIG.ebsco.databases.academicSearchComplete}&bquery=${convertToEbsco(q)}`,
  },
  {
    id: 'mlaInternationalBibliography',
    label: 'MLA International Bibliography',
    icon: 'assets/images/external/icon_brands/icon_ebsco.svg',
    buildUrl: q =>
      `${CONFIG.ebsco.base}&db=${CONFIG.ebsco.databases.mlaInternationalBibliography}&bquery=${convertToEbsco(q)}`,
  },
  {
    id: 'googleScholar',
    label: 'Google Scholar',
    icon: 'assets/images/external/icon_brands/icon_google_scholar.svg',
    buildUrl: q => `${CONFIG.googleScholar.base}${convertToGoogle(q)}`,
  },
  {
    id: 'worldcat',
    label: 'WorldCat',
    icon: 'assets/images/external/icon_brands/icon_worldcat.svg',
    buildUrl: q => `${CONFIG.worldcat.base}${convertToWorldCat(q)}`,
  },
  {
    id: 'hathitrust',
    label: 'HathiTrust',
    icon: 'assets/images/external/icon_brands/icon_hathi_trust.svg',
    buildUrl: q => `${CONFIG.hathitrust.base}${convertToKeywords(q)}`,
  },
  {
    id: 'jstor',
    label: 'JSTOR',
    icon: 'assets/images/external/icon_brands/icon_jstor.svg',
    buildUrl: q => `${CONFIG.jstor.base}${convertToKeywords(q)}`,
  },
  {
    id: 'internetArchive',
    label: 'Internet Archive',
    icon: 'assets/images/external/icon_brands/icon_internet_archive.svg',
    buildUrl: q => `${CONFIG.internetArchive.base}${convertToKeywords(q)}`,
  },
  {
    id: 'pubmed',
    label: 'PubMed',
    icon: 'assets/images/external/icon_brands/icon_pubmed.svg',
    buildUrl: q => `${CONFIG.pubmed.base}${convertToKeywords(q)}`,
  },
  {
    id: 'wikipedia',
    label: 'Wikipedia',
    icon: 'assets/images/external/icon_brands/icon_wikipedia.svg',
    buildUrl: q => `${CONFIG.wikipedia.base}${convertToKeywords(q)}`,
  },
];

// =====================================================================
// Query translation
// =====================================================================
// A simple search becomes the bare terms (matches legacy VE behavior).
// An advanced search becomes one system-specific segment per clause,
// joined together, after filter clauses have been stripped.

// True for any Primo field that should be dropped before translation
// — facet fields (matched by the `facet_` prefix) plus the explicit
// extraFilterFields list.
function isFilterField(field: string): boolean {
  return field.startsWith('facet_') || CONFIG.primo.extraFilterFields.has(field);
}

// Drops filter clauses, leaving only user-typed search terms.
function searchableClauses(clauses: PrimoClause[]): PrimoClause[] {
  return clauses.filter(c => !isFilterField(c.field));
}

// Drops clauses that Primo marked for exclusion (i.e. that follow a
// `NOT` conjunction). Used by targets that can't express NOT in their
// query syntax — including the excluded clause as a positive search
// term would over-restrict results.
function dropExcludedClauses(clauses: PrimoClause[]): PrimoClause[] {
  return clauses.filter((_, i, all) => i === 0 || all[i - 1].conjunction !== 'NOT');
}

// True when the query has any user-typed terms (vs. only refinements);
// used to hide the block when the user is only browsing facets.
function hasSearchableContent(query: PrimoQuery): boolean {
  return query.kind === 'simple' || searchableClauses(query.clauses).length > 0;
}

// Glues advanced-search segments together using each clause's own
// conjunction. Primo stores the conjunction on the clause *before* the
// join, so the last clause's conjunction is unused.
function joinClauses(clauses: PrimoClause[], toSegment: (c: PrimoClause) => string): string {
  return clauses
    .map((c, i) => i === clauses.length - 1 ? toSegment(c) : `${toSegment(c)}+${c.conjunction}+`)
    .join('');
}

// Primo → EBSCO `bquery` syntax.
function convertToEbsco(query: PrimoQuery): string {
  if (query.kind === 'simple') return spaceToPlus(query.terms);
  return joinClauses(searchableClauses(query.clauses), c => {
    const terms = spaceToPlus(c.terms);
    const prefix = CONFIG.ebsco.fieldPrefix[c.field];
    return prefix ? `${prefix}+(${terms})` : `(${terms})`;
  });
}

// Primo → WorldCat `queryString` syntax. Relies on WorldCat's
// implicit-AND between space-separated clauses; NOT-joined exclusions
// are dropped via `dropExcludedClauses`, and OR conjunctions degrade
// to AND. See the WorldCat note in CONFIG above for the spacing /
// encoding rationale.
function convertToWorldCat(query: PrimoQuery): string {
  if (query.kind === 'simple') return encodeURIComponent(query.terms);
  return dropExcludedClauses(searchableClauses(query.clauses))
    .map(c => `${CONFIG.worldcat.fieldPrefix[c.field] ?? 'kw:'}${encodeURIComponent(c.terms)}`)
    .join('%20');
}

// Primo → Google Scholar `q` syntax.
function convertToGoogle(query: PrimoQuery): string {
  if (query.kind === 'simple') return spaceToPlus(query.terms);
  return joinClauses(searchableClauses(query.clauses), c => `(${spaceToPlus(c.terms)})`);
}

// Bare keyword terms (no encoding, no field syntax) — used by
// systems that accept simple keyword queries. Advanced searches
// collapse to a single space-joined string, with NOT-joined
// exclusions dropped (same rationale as WorldCat).
function keywordTerms(query: PrimoQuery): string {
  if (query.kind === 'simple') return query.terms;
  return dropExcludedClauses(searchableClauses(query.clauses))
    .map(c => c.terms)
    .join(' ');
}

// Primo → URL-encoded keyword string for systems with no field syntax
// (HathiTrust, JSTOR, Internet Archive, PubMed, Wikipedia).
function convertToKeywords(query: PrimoQuery): string {
  return encodeURIComponent(keywordTerms(query));
}

// =====================================================================
// Component
// =====================================================================

interface ExternalLink {
  label: string;
  icon: string;
  href: string;
}

@Component({
  selector: 'nde-search-results-after',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './try-my-search.component.html',
  styleUrls: ['./try-my-search.component.scss'],
})
export class TryMySearchComponent implements OnInit, OnDestroy {
  links: ExternalLink[] = [];

  private readonly router = inject(SHELL_ROUTER);
  private readonly assets = inject(AssetBaseService);
  private routerSub?: Subscription;

  // Builds the initial set of links and resubscribes for future searches.
  // The shell navigates between searches without a full page reload, so
  // we re-derive the links on each route change.
  ngOnInit(): void {
    this.refresh();
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(() => this.refresh());
  }

  // Releases the router subscription when the component is torn down.
  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
  }

  // Re-reads the current URL and rebuilds the link list. Sets `links`
  // empty when the URL has no query or only filter refinements, which
  // hides the block via `*ngIf` in the template.
  private refresh(): void {
    const query = parsePrimoQuery(window.location.search);
    if (!query || !hasSearchableContent(query)) {
      this.links = [];
      return;
    }
    this.links = SYSTEMS
      .filter(s => CONFIG.enabled[s.id])
      .map(({ label, icon, buildUrl }) => ({
        label,
        // Resolve `assets/...` paths through the customModule's asset
        // service so they survive deployment behind a non-root base
        // URL (the page lives under /nde/, not /).
        icon: icon ? this.assets.resolveAssetUrl(icon) : '',
        href: buildUrl(query),
      }));
  }
}
