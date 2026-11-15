import { Component, signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormField, form } from '@angular/forms/signals';
import { CharacterLimit } from './character-limit';

@Component({
  imports: [CharacterLimit, FormField],
  template: `<input [formField]="field" [appCharacterLimit]="limit()" />`,
})
class Host {
  readonly limit = signal(10);
  readonly value = signal('');
  protected readonly field = form(this.value);
}

describe('CharacterLimit', () => {
  let fixture: ComponentFixture<Host>;
  let input: HTMLInputElement;

  async function render(value = ''): Promise<void> {
    fixture = TestBed.createComponent(Host);
    fixture.componentInstance.value.set(value);
    await fixture.whenStable();
    const found = (fixture.nativeElement as HTMLElement).querySelector('input');
    if (!found) throw new Error('No field');
    input = found;
  }

  /** What the browser leaves in the field after a keystroke or a paste, the cursor at `caret`. */
  async function edit(value: string, caret = value.length, composing = false): Promise<void> {
    input.value = value;
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new InputEvent('input', { isComposing: composing }));
    await fixture.whenStable();
  }

  it('lets the browser count nothing: no maxlength, which would count code units', async () => {
    await render();

    expect(input.maxLength).toBe(-1);
  });

  it('keeps a full field as it was when one more character is typed', async () => {
    await render();

    await edit('a'.repeat(10));
    await edit('a'.repeat(11));

    expect(input.value).toBe('a'.repeat(10));
    expect(fixture.componentInstance.value()).toBe('a'.repeat(10));
  });

  it('keeps as much of a paste as fits', async () => {
    await render();

    await edit('Cena de verano del equipo');

    expect(input.value).toBe('Cena de ve');
    expect(fixture.componentInstance.value()).toBe('Cena de ve');
  });

  it('refuses a character typed inside a full field, leaving the rest and the cursor in place', async () => {
    await render('Cena junto');

    // "X" typed after "Cena ": the browser has already put it there, with the cursor after it.
    await edit('Cena Xjunto', 6);

    expect(input.value).toBe('Cena junto');
    expect([input.selectionStart, input.selectionEnd]).toEqual([5, 5]);
    expect(fixture.componentInstance.value()).toBe('Cena junto');
  });

  it('leaves the field alone while what it holds fits, a selection included', async () => {
    await render();
    input.value = 'Ana';
    input.setSelectionRange(0, 3);
    input.dispatchEvent(new InputEvent('input'));
    await fixture.whenStable();

    expect(input.value).toBe('Ana');
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 3]);
    expect(fixture.componentInstance.value()).toBe('Ana');
  });

  it('waits for a composed character to be committed before cutting', async () => {
    await render('a'.repeat(9));

    // Pinyin typed for one Chinese character: the provisional "ni" goes past 10 for a while.
    await edit(`${'a'.repeat(9)}ni`, 11, true);
    expect(input.value).toBe(`${'a'.repeat(9)}ni`);

    await edit(`${'a'.repeat(9)}你`, 10, true);
    input.dispatchEvent(new CompositionEvent('compositionend'));
    await fixture.whenStable();
    expect(input.value).toBe(`${'a'.repeat(9)}你`);

    await edit(`${'a'.repeat(9)}你好`, 11, true);
    expect(input.value).toBe(`${'a'.repeat(9)}你好`);
    input.dispatchEvent(new CompositionEvent('compositionend'));
    await fixture.whenStable();
    expect(input.value).toBe(`${'a'.repeat(9)}你`);
    expect(fixture.componentInstance.value()).toBe(`${'a'.repeat(9)}你`);
  });

  it('cuts at the limit it is given now', async () => {
    await render();
    fixture.componentInstance.limit.set(3);
    await fixture.whenStable();

    await edit('Pietro');

    expect(input.value).toBe('Pie');
  });
});
