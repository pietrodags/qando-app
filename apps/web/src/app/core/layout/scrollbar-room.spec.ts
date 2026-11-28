import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideScrollbarRoom } from './scrollbar-room';

describe('provideScrollbarRoom', () => {
  const root = document.documentElement;

  /**
   * The width of the page's box, between its scrollbars' rooms, as the browser would lay it out.
   * Not `clientWidth`: Chromium reports the window's whole width there while its scrollbars are
   * hidden, though it keeps their room.
   */
  function layOutPage(width: number): void {
    Object.defineProperty(root, 'offsetWidth', { configurable: true, value: width });
  }

  function start(): void {
    TestBed.configureTestingModule({ providers: [provideScrollbarRoom()] });
    TestBed.inject(EnvironmentInjector);
  }

  function resize(): void {
    window.dispatchEvent(new Event('resize'));
  }

  afterEach(() => {
    Reflect.deleteProperty(root, 'offsetWidth');
    root.removeAttribute('data-scrollbar-room');
  });

  it('marks the page when its scrollbars take room beside it', () => {
    layOutPage(window.innerWidth - 30);

    start();

    expect(root.hasAttribute('data-scrollbar-room')).toBe(true);
  });

  it('marks nothing when the scrollbars take no room (a trackpad on a Mac, a phone)', () => {
    layOutPage(window.innerWidth);

    start();

    expect(root.hasAttribute('data-scrollbar-room')).toBe(false);
  });

  it('marks the page once a resize gives its scrollbars room', () => {
    layOutPage(window.innerWidth);
    start();

    layOutPage(window.innerWidth - 30);
    resize();

    expect(root.hasAttribute('data-scrollbar-room')).toBe(true);
  });

  it('takes the mark away once a resize leaves its scrollbars no room', () => {
    layOutPage(window.innerWidth - 30);
    start();

    layOutPage(window.innerWidth);
    resize();

    expect(root.hasAttribute('data-scrollbar-room')).toBe(false);
  });

  it('stops looking when the app is destroyed', () => {
    layOutPage(window.innerWidth);
    start();
    TestBed.resetTestingModule();

    layOutPage(window.innerWidth - 30);
    resize();

    expect(root.hasAttribute('data-scrollbar-room')).toBe(false);
  });
});
