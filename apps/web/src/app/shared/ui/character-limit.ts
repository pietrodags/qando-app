import { Directive, ElementRef, inject, input } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { clipBefore } from '@qando/domain';

/**
 * Stops a text field or a text area of a Signal Form at `appCharacterLimit` characters as people see them, once
 * the spaces around are gone, as a field's own limit would: what was just typed or pasted past it
 * is dropped, the rest and the cursor kept, and the form's value follows. No `maxlength`, which
 * counts code units: it would cut an emoji or an accent in two. While a character is being
 * composed (Chinese or Japanese typed by its sounds), the provisional text may go past the limit
 * though the character fits: the cut waits for it to be committed.
 */
@Directive({
  selector: 'input[formField][appCharacterLimit], textarea[formField][appCharacterLimit]',
  host: {
    '(input)': 'clip($event)',
    '(compositionend)': 'clip($event)',
  },
})
export class CharacterLimit {
  /** The most characters the field holds. */
  readonly appCharacterLimit = input.required<number>();

  private readonly field =
    inject<ElementRef<HTMLInputElement | HTMLTextAreaElement>>(ElementRef).nativeElement;
  private readonly formField = inject<FormField<string>>(FormField);

  protected clip(event: Event): void {
    if (event instanceof InputEvent && event.isComposing) return;
    const { value } = this.field;
    const edit = clipBefore(
      value,
      this.appCharacterLimit(),
      this.field.selectionEnd ?? value.length,
    );
    if (edit.text === value) return;
    // The field first: when the cut gives back the value the form held before, the form sees no
    // change and would leave the extra characters on screen.
    this.field.value = edit.text;
    this.field.setSelectionRange(edit.caret, edit.caret);
    this.formField.state().value.set(edit.text);
  }
}
