import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { provideI18n } from './core/i18n/provide-i18n';

describe('App', () => {
  async function render(): Promise<HTMLElement> {
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
});
