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

  it('keeps the page as tall as was seen of it when a part gave way, while the one that took its place is there', () => {
    handover.leave();
    const summary = part();

    handover.arrive(summary.ref);
    expect(pageHeight.kept()).toBe(920);

    summary.end();
    expect(pageHeight.kept()).toBeNull();
  });

  it('keeps nothing for a part that comes from another step, also after one took what was left', () => {
    handover.arrive(part().ref);
    expect(pageHeight.kept()).toBeNull();

    handover.leave();
    handover.arrive(part().ref);
    removeTestPage();
    handover.arrive(part().ref);

    expect(pageHeight.kept()).toBeNull();
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
});
