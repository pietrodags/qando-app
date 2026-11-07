import { Component, input, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ResultsOption } from '@qando/contracts';

let nextListId = 0;

/**
 * Who answered an option, behind a "Lista de asistentes" toggle that starts closed: the
 * preferred in bold, then the available, then, struck through, who cannot come. Each group comes
 * in the order the results give. A screen reader hears the answer after each marked name.
 */
@Component({
  selector: 'app-name-list',
  imports: [TranslocoPipe],
  styleUrl: './name-list.scss',
  host: { '[class]': 'look()' },
  templateUrl: './name-list.html',
})
export class NameList {
  readonly names = input.required<NonNullable<ResultsOption['names']>>();
  /** Under the winning date (larger chips, on white) or under an option of the chart. */
  readonly look = input<'winner' | 'option'>('option');

  protected readonly open = signal(false);
  protected readonly listId = `results-names-${String((nextListId += 1))}`;
}
