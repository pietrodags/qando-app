import { TestBed } from '@angular/core/testing';
import { WholeNavigation } from './whole-navigation';

describe('WholeNavigation', () => {
  afterEach(() => {
    history.replaceState(null, '', location.pathname);
  });

  it('opens the address in the browser, in place of the page it leaves', () => {
    const pages = history.length;

    // Within the page, the only navigation the tests' browser makes.
    TestBed.inject(WholeNavigation).replaceWith('#next');

    expect(location.hash).toBe('#next');
    expect(history.length).toBe(pages);
  });
});
