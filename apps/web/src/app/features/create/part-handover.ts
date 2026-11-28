import {
  DOCUMENT,
  type DestroyRef,
  Injector,
  Service,
  afterNextRender,
  inject,
} from '@angular/core';

/** The page kept as tall as was seen of it when a part gave way. */
interface Hold {
  /** How tall the page is kept, in px. */
  readonly height: number;
  /** A part took the place of the one that gave way, and keeps the page while it is there. */
  adopted: boolean;
}

/**
 * The times (`WizardTimes`) and their summary (`WizardSummary`) take each other's place in the
 * same card: the one that comes in may be shorter, and a page that shrank under its scroll would
 * be scrolled up by the browser, moving the columns down. So the part that gives way keeps the
 * page as tall as was seen of it at once (`leave`), before anything of the swap is laid out (a
 * phone lays the page out as soon as a part reads the screen's height), and the one that takes its
 * place keeps it so while it is there (`arrive`): the room left goes under the card, the columns
 * stay where they were, and the card ends where its new part does. A page no part kept is let go
 * once drawn, and a part that comes from another step keeps nothing.
 */
@Service()
export class PartHandover {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly injector = inject(Injector);
  /** What keeps the page tall, if anything does. */
  private hold: Hold | null = null;

  /** The part on screen gives way to the other. */
  leave(): void {
    const hold: Hold = { height: window.scrollY + window.innerHeight, adopted: false };
    this.hold = hold;
    this.root.style.setProperty('min-block-size', `${String(hold.height)}px`);
    afterNextRender(
      () => {
        if (this.hold === hold && !hold.adopted) this.release();
      },
      { injector: this.injector },
    );
  }

  /**
   * The part that takes the place of the one that gave way keeps the page as tall as was seen of
   * it, until `destroyRef` ends: nothing when no part gave way.
   */
  arrive(destroyRef: DestroyRef): void {
    const hold = this.hold;
    if (hold === null) return;
    hold.adopted = true;
    destroyRef.onDestroy(() => {
      // A part that gave way after this one came keeps the page as it set it.
      if (this.hold === hold) this.release();
    });
  }

  private release(): void {
    this.hold = null;
    this.root.style.removeProperty('min-block-size');
  }
}
