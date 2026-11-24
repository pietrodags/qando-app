import { Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * "Privacidad y condiciones": what qando keeps, what for, for how long, who else handles it and
 * how to have it deleted, then the terms of use. Open to anyone, signed in or not.
 */
@Component({
  selector: 'app-privacy-page',
  imports: [TranslocoPipe],
  templateUrl: './privacy-page.html',
  styleUrl: './privacy-page.scss',
})
export class PrivacyPage {}
