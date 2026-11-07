import { Component, computed, inject, input } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { type Results, resultsEndpoint } from '@qando/contracts';
import { apiError, apiResource } from '../../core/api/api-resource';
import { ErrorState } from '../../shared/ui/error-state';
import { LoadingState } from '../../shared/ui/loading-state';
import { NotFoundCard } from '../../shared/ui/not-found-card';
import { ShareLinks } from '../../shared/ui/share-links';
import { VoteEnded } from '../vote/vote-ended';
import { NameList } from './name-list';
import { OptionLabels } from './option-labels';
import { ResultsChart } from './results-chart';

/** The key of the sentence over the winning dates, by outcome. */
const SENTENCES: Record<Results['outcome'], string> = {
  'no-votes': 'results.sentence.noVotes',
  'nobody-can-attend': 'results.sentence.nobodyCanAttend',
  one: 'results.sentence.one',
  two: 'results.sentence.two',
  three: 'results.sentence.three',
  several: 'results.sentence.several',
  all: 'results.sentence.all',
};

/**
 * The results page, opened with the results link: what the votes amount to as they stand now.
 * Under the event's title, a confirmed date when there is one, the sentence of the outcome and
 * the winning dates (one to three; with one winner on a named event, its attendee list), the
 * counts, provisional while voting is open and final after, the chart of winners and
 * alternatives, and the share buttons for the link. A link of no results (unknown, malformed,
 * or the participation link) shows the page not found; a cancelled event says so under its title.
 */
@Component({
  selector: 'app-results-page',
  imports: [
    ErrorState,
    LoadingState,
    NameList,
    NotFoundCard,
    ResultsChart,
    ShareLinks,
    TranslocoPipe,
    VoteEnded,
  ],
  styleUrl: './results-page.scss',
  templateUrl: './results-page.html',
})
export class ResultsPage {
  /** The results ID, from the route. */
  readonly resultsId = input.required<string>();

  private readonly transloco = inject(TranslocoService);
  protected readonly labels = inject(OptionLabels);

  protected readonly results = apiResource(resultsEndpoint, () => ({
    resultsId: this.resultsId(),
  }));

  protected readonly notFound = computed(() => {
    const status = apiError(resultsEndpoint, this.results.error())?.status;
    return status === 404 || status === 400 || status === 403;
  });
  /** The kept title of a cancelled event; null otherwise. */
  protected readonly cancelledTitle = computed(() => {
    const error = apiError(resultsEndpoint, this.results.error());
    return error?.status === 410 ? error.body.error.title : null;
  });

  protected readonly sentence = computed<string>(() => {
    if (!this.results.hasValue()) return '';
    const { outcome, winners, confirmedOption } = this.results.value();
    if (outcome !== 'one') return SENTENCES[outcome];
    // Once a date is confirmed, the winner is only the most voted: the decision is above it.
    const plural = winners[0]?.option.dates.kind === 'range' ? 'Group' : '';
    const voted = confirmedOption === null ? '' : 'MostVoted';
    return `results.sentence.one${plural}${voted}`;
  });
  /** The winner's attendee list: one winner, on a named event. */
  protected readonly winnerNames = computed(() => {
    if (!this.results.hasValue()) return null;
    const { winnersListed, winners } = this.results.value();
    return winnersListed && winners.length === 1 ? (winners[0]?.names ?? null) : null;
  });
  /** Several winners listed on a named event: their lists are in the chart. */
  protected readonly tieHint = computed(() => {
    if (!this.results.hasValue()) return false;
    const { winnersListed, winners } = this.results.value();
    return winnersListed && winners.length > 1 && winners.some(({ names }) => names !== undefined);
  });
  protected readonly counters = computed(() => {
    if (!this.results.hasValue()) return [];
    const { voters, attending, notAttending } = this.results.value();
    return [
      { label: 'results.voters', count: voters },
      { label: 'results.attending', count: attending },
      { label: 'results.notAttending', count: notAttending },
    ];
  });
  protected readonly charted = computed(
    () =>
      this.results.hasValue() &&
      this.results.value().outcome !== 'no-votes' &&
      this.results.value().outcome !== 'nobody-can-attend',
  );

  /** The results link itself, without anything the address may carry after it. */
  protected readonly shareUrl = computed(() => `${location.origin}/results/${this.resultsId()}`);
  /** The confirmed date, else the only winner, is told; otherwise the results are offered. */
  protected readonly shareText = computed(() => {
    if (!this.results.hasValue()) return '';
    const { title, outcome, winners, confirmedOption } = this.results.value();
    const decided = confirmedOption ?? (outcome === 'one' ? winners[0]?.option : undefined);
    return decided === undefined
      ? this.transloco.translate('results.shareText.default', { title })
      : this.transloco.translate('results.shareText.decided', {
          title,
          date: this.labels.plain(decided),
        });
  });
}
