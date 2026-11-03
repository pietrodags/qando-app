import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideI18n } from './provide-i18n';

@Component({ template: '' })
class EmptyPage {}

describe('I18nTitleStrategy', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({
      providers: [
        provideI18n(),
        provideRouter([
          { path: '', component: EmptyPage },
          { path: 'sign-in', title: 'pages.signIn.title', component: EmptyPage },
        ]),
      ],
    });
    harness = await RouterTestingHarness.create();
  });

  it('names the tab after the translated page title, followed by the brand', async () => {
    await harness.navigateByUrl('/sign-in');

    expect(TestBed.inject(Title).getTitle()).toBe('Entrar | qando');
  });

  it('names the tab after the brand alone on a page without a title', async () => {
    await harness.navigateByUrl('/sign-in');
    await harness.navigateByUrl('/');

    expect(TestBed.inject(Title).getTitle()).toBe('qando');
  });
});
