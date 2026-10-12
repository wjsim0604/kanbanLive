import { initials } from './format';

describe('initials', () => {
  it.each([
    ['Jane Doe', 'JD'],
    ['alice', 'A'],
    ['김지우', '김'],
    ['데모 사용자', '데'],
    ['  ', '?'],
  ])('%s → %s', (name, expected) => expect(initials(name)).toBe(expected));
});
