import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type TestScreen, installTestScreen } from '../../../test/media-queries';
import { screenMatches } from './screen-matches';

const WIDE = '(min-width: 650px)';

@Component({ template: '' })
class Host {
  readonly wide = screenMatches(WIDE);
}

describe('screenMatches', () => {
  let screen: TestScreen;

  function create(): Host {
    return TestBed.createComponent(Host).componentInstance;
  }

  it('says whether the screen matches the query when it is called', () => {
    screen = installTestScreen({ [WIDE]: true });
    expect(create().wide()).toBe(true);

    screen = installTestScreen({ [WIDE]: false });
    expect(create().wide()).toBe(false);
  });

  it('follows the screen as it turns or the window is resized', () => {
    screen = installTestScreen({ [WIDE]: false });
    const host = create();

    screen.set(WIDE, true);
    expect(host.wide()).toBe(true);

    screen.set(WIDE, false);
    expect(host.wide()).toBe(false);
  });

  it('stops following the screen once its component is gone', () => {
    screen = installTestScreen({ [WIDE]: false });
    const fixture = TestBed.createComponent(Host);
    const { wide } = fixture.componentInstance;

    fixture.destroy();
    screen.set(WIDE, true);

    expect(wide()).toBe(false);
  });
});
