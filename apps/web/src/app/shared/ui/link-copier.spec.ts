import { TestBed } from '@angular/core/testing';
import { provideI18n } from '../../core/i18n/provide-i18n';
import { LinkCopier } from './link-copier';
import { Toaster } from './toast';

describe('LinkCopier', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideI18n()] });
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard');
  });

  function copying(result: Promise<void>): ReturnType<typeof vi.fn> {
    const writeText = vi.fn(() => result);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return writeText;
  }

  it('copies the address as given and says so', async () => {
    const writeText = copying(Promise.resolve());

    await TestBed.inject(LinkCopier).copy('https://qando.app/api/mcp');

    expect(writeText).toHaveBeenCalledWith('https://qando.app/api/mcp');
    expect(TestBed.inject(Toaster).message()).toBe('Enlace copiado');
  });

  it('says nothing when the browser refuses to copy', async () => {
    copying(Promise.reject(new Error('denied')));

    await TestBed.inject(LinkCopier).copy('https://qando.app/api/mcp');

    expect(TestBed.inject(Toaster).message()).toBeNull();
  });
});
