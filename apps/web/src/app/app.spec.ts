import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { provideI18n } from './core/i18n/provide-i18n';
import { installTestScreen } from '../test/media-queries';

describe('App', () => {
  async function render(): Promise<HTMLElement> {
    installTestScreen();
    TestBed.configureTestingModule({
      imports: [App],
      providers: [provideI18n(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the header above the routed page', async () => {
    const element = await render();

    const header = element.querySelector('app-header');
    expect(header).not.toBeNull();
    expect(header?.nextElementSibling?.tagName).toBe('ROUTER-OUTLET');
  });

  it('has a place for the short messages of any page', async () => {
    const element = await render();

    expect(element.querySelector('app-toast [role="status"]')).not.toBeNull();
  });

  it('draws the waves behind every page, last in the reading order so its button comes after the page', async () => {
    const element = await render();

    expect(element.lastElementChild?.tagName).toBe('APP-WAVES-BACKGROUND');
  });
});
