import { EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideKeyboardFocusRing } from './keyboard-focus';

describe('provideKeyboardFocusRing', () => {
  const root = document.documentElement;
  let first: HTMLInputElement;
  let second: HTMLInputElement;

  function start(): void {
    TestBed.configureTestingModule({ providers: [provideKeyboardFocusRing()] });
    TestBed.inject(EnvironmentInjector);
  }

  function press(key = 'Tab'): void {
    document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  }

  function pointAt(element: HTMLElement): void {
    element.dispatchEvent(new Event('pointerdown', { bubbles: true }));
  }

  beforeEach(() => {
    first = document.createElement('input');
    second = document.createElement('input');
    document.body.append(first, second);
  });

  afterEach(() => {
    first.remove();
    second.remove();
    root.removeAttribute('data-keyboard-focus');
  });

  it('marks nothing when a field gets the focus on load, before any key or pointer', () => {
    start();

    first.focus();

    expect(root.hasAttribute('data-keyboard-focus')).toBe(false);
  });

  it('marks the page while the focus was brought by a key', () => {
    start();

    press();
    first.focus();

    expect(root.hasAttribute('data-keyboard-focus')).toBe(true);
  });

  it('marks nothing when the focus was brought by a click or a tap', () => {
    start();

    pointAt(first);
    first.focus();

    expect(root.hasAttribute('data-keyboard-focus')).toBe(false);
  });

  it('takes the mark away when a click follows the keyboard', () => {
    start();
    press();
    first.focus();

    pointAt(second);
    second.focus();

    expect(root.hasAttribute('data-keyboard-focus')).toBe(false);
  });

  it('keeps the field without a ring while the person types into it after a click', () => {
    start();
    pointAt(first);
    first.focus();

    press('L');

    expect(root.hasAttribute('data-keyboard-focus')).toBe(false);
  });

  it('keeps the ring while the person types into a field reached with Tab', () => {
    start();
    press();
    first.focus();

    pointAt(document.body);
    press('L');

    expect(root.hasAttribute('data-keyboard-focus')).toBe(true);
  });

  it('stops listening when the app is destroyed', () => {
    start();
    TestBed.resetTestingModule();

    press();
    first.focus();

    expect(root.hasAttribute('data-keyboard-focus')).toBe(false);
  });
});
