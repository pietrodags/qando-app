import { Component, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import type { ResultsOption } from '@qando/contracts';
import { NameList } from './name-list';
import { OptionLabels } from './option-labels';

/** The three answers, in the order the bars draw them. */
const ANSWERS = ['preferred', 'available', 'unavailable'] as const;

/**
 * The chart of the results: a legend of the three answers, then one bar per winner and, under
 * their own heading, one per alternative. Each bar counts who preferred, could and could not come,
 * each answer as wide as its share of the voters; an answer nobody gave is left out. Options
 * with names (named events) offer their list under the bar.
 */
@Component({
  selector: 'app-results-chart',
  imports: [NameList, NgTemplateOutlet, TranslocoPipe],
  styleUrl: './results-chart.scss',
  templateUrl: './results-chart.html',
})
export class ResultsChart {
  readonly winners = input.required<readonly ResultsOption[]>();
  readonly alternatives = input.required<readonly ResultsOption[]>();
  /** Everyone who voted: the full width of a bar. */
  readonly voters = input.required<number>();

  protected readonly labels = inject(OptionLabels);
  protected readonly answers = ANSWERS;

  /** "0.25": the share of the voters who gave a count, of the bar's full width. */
  protected share(count: number): string {
    return String(count / this.voters());
  }
}
