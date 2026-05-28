import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

// =====================================================================
// Configuration
// =====================================================================
// Mirrors the existing Alma add-on JSON
// (`add-ons/libraryh3lp/libraryh3lp_nde_config.json`) so disabling that
// add-on swaps to identical chat behavior. This block is the seam for
// eventual add-on extraction: replace with MODULE_PARAMETERS injection
// when shipping as a CARLI-shareable add-on. Everything below moves
// unchanged.

const CONFIG = {

  // --- LibraryH3lp connection ----------------------------------------
  // We embed the chat as a direct iframe rather than via libraryh3lp.js
  // — the script wraps its iframe in a height-auto <div>, which made it
  // impossible to size the chat to fill our drawer. The iframe URL is
  // the same one the script would have produced.
  //
  //   https://<server>/chat/<queueName>@chat.<server>?skin=<skinId>
  //
  // `skinId` is set in the LibraryH3lp admin and controls the chat's
  // visual theme. Drop the `?skin=…` parameter to use the default.
  server:    'libraryh3lp.com',
  queueName: 'cs-loyolachicago',
  skinId:    36383,

  // --- UI ------------------------------------------------------------
  triggerLabel: 'Ask A Librarian',

};

// =====================================================================
// Component
// =====================================================================

@Component({
  selector: 'nde-user-area-after',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
})
export class ChatComponent implements OnInit, AfterViewInit, OnDestroy {
  // Drawer state.
  isOpen = false;

  // The iframe is created on first open and persists across subsequent
  // closes, so chat history survives close/reopen.
  hasLoaded = false;

  readonly triggerLabel = CONFIG.triggerLabel;

  // Used to portal the custom-element host to <body> after view init
  // (see ngAfterViewInit) so the chat escapes NDE shell stacking
  // contexts.
  private readonly elementRef = inject(ElementRef);

  // Bypass Angular's RESOURCE_URL sanitization for the iframe src: our
  // chat URL is a hardcoded constant from CONFIG, not user input.
  private readonly sanitizer = inject(DomSanitizer);
  readonly chatUrl: SafeResourceUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
    `https://${CONFIG.server}/chat/${CONFIG.queueName}@chat.${CONFIG.server}?skin=${CONFIG.skinId}`,
  );

  // Arrow form so `this` binds correctly and so add/remove see the
  // same function reference.
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' && this.isOpen) this.close();
  };

  // Sets up the keydown listener. The iframe isn't mounted yet — that
  // waits for the user's first interaction with the tab, so we don't
  // make a third-party request on every page load.
  ngOnInit(): void {
    document.addEventListener('keydown', this.onKeyDown);
  }

  // Moves the custom-element host to <body> so the chat panel escapes
  // any stacking contexts created by NDE shell wrappers (transform,
  // filter, etc.) between our mount point and the document root.
  // Without this, our `z-index` would be trapped inside the nearest
  // stacking-context-creating ancestor — even values like 1000 can
  // end up below NDE's own controls because they live in a different
  // ancestor stack. Same trick Angular CDK's Overlay uses.
  ngAfterViewInit(): void {
    document.body.appendChild(this.elementRef.nativeElement);
  }

  // Releases the keydown listener when the component is torn down.
  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
  }

  // Click handlers for the tab and (implicitly) the backdrop.
  toggle(): void { this.isOpen ? this.close() : this.open(); }
  open(): void   { this.hasLoaded = true; this.isOpen = true; }
  close(): void  { this.isOpen = false; }
}
