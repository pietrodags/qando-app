import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { HoverTip } from '../../shared/ui/hover-tip';
import { ShareLinks } from '../../shared/ui/share-links';
import { Tooltip } from '../../shared/ui/tooltip';
import { ManageSection } from './manage-section';

/**
 * One link of the event: its name's key, its path and whole address, the key of the words that
 * share it, and whether the page can open it.
 */
interface EventLink {
  readonly name: string;
  readonly path: string;
  readonly url: string;
  readonly words: string;
  readonly opens: boolean;
}

/**
 * The links of an event, for its organizer to pass on, in a section closed as the page opens:
 * the participation link, to share with the group, and the results link, which also opens here
 * with a bar chart. Each is shown without its protocol in a white well, and shared in full by
 * the block under it, with words of its own and the event's title, the block named by the link
 * for a screen reader (both blocks' buttons have the same names). The management link is never
 * shown: it is the one the organizer is using.
 */
@Component({
  selector: 'app-event-links',
  imports: [HoverTip, ManageSection, RouterLink, ShareLinks, Tooltip, TranslocoPipe],
  styleUrl: './event-links.scss',
  templateUrl: './event-links.html',
})
export class EventLinks {
  readonly participationId = input.required<string>();
  readonly resultsId = input.required<string>();
  /** The event's title, which the links are shared with. */
  readonly title = input.required<string>();

  protected readonly host = location.host;

  protected readonly links = computed<readonly EventLink[]>(() => {
    const vote = `/vote/${this.participationId()}`;
    const results = `/results/${this.resultsId()}`;
    return [
      {
        name: 'manage.links.vote',
        path: vote,
        url: `${location.origin}${vote}`,
        words: 'common.share.voteText',
        opens: false,
      },
      {
        name: 'manage.links.results',
        path: results,
        url: `${location.origin}${results}`,
        words: 'manage.links.resultsText',
        opens: true,
      },
    ];
  });
}
