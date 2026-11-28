import { DestroyRef, EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type TestPage, installTestPage, removeTestPage } from '../../../test/page-height';
import { PartHandover } from './part-handover';

describe('PartHandover', () => {
  let handover: PartHandover;
  let pageHeight: TestPage;

  beforeEach(() => {
    handover = TestBed.inject(PartHandover);
    pageHeight = installTestPage(120, 800);
  });

  afterEach(() => {
    removeTestPage();
  });

  /** A part on the page, until `end`. */
  function part(): { readonly ref: DestroyRef; readonly end: () => void } {
    const injector = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    return {
      ref: injector.get(DestroyRef),
      end: () => {
        injector.destroy();
      },
    };
  }

  it('keeps the page as tall as was seen of it from the moment a part gives way, before the other comes', () => {
    handover.leave();

    expect(pageHeight.kept()).toBe(920);
  });

  it('keeps it so while the part that took the place is there, after the page is drawn', () => {
    handover.leave();
    const summary = part();

    handover.arrive(summary.ref);
    TestBed.tick();
    expect(pageHeight.kept()).toBe(920);

    summary.end();
    expect(pageHeight.kept()).toBeNull();
  });

  it('lets the page go once it is drawn when no part took the place of the one that gave way', () => {
    handover.leave();

    TestBed.tick();

    expect(pageHeight.kept()).toBeNull();
  });

  it('keeps nothing for a part that comes from another step, also after one took what was left and went', () => {
    handover.arrive(part().ref);
    expect(pageHeight.kept()).toBeNull();

    handover.leave();
    const summary = part();
    handover.arrive(summary.ref);
    summary.end();
    const later = part();
    handover.arrive(later.ref);
    handover.leave();
    later.end();

    expect(pageHeight.kept()).toBe(920);
  });

  it('leaves the page as the last part that came in kept it when an earlier one goes', () => {
    handover.leave();
    const summary = part();
    handover.arrive(summary.ref);
    pageHeight.scroll(300);
    handover.leave();
    handover.arrive(part().ref);

    summary.end();

    expect(pageHeight.kept()).toBe(1100);
  });

  it('keeps the page for the last part that gave way when two gave way before it was drawn', () => {
    handover.leave();
    pageHeight.scroll(300);
    handover.leave();
    handover.arrive(part().ref);

    TestBed.tick();

    expect(pageHeight.kept()).toBe(1100);
  });
});
