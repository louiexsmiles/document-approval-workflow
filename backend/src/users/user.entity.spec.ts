import { User } from './user.entity';

describe('test harness', () => {
  // Doubles as a config check: if ts-jest weren't reading the decorator settings from
  // tsconfig, importing a decorated entity would fail outright.
  it('runs TypeScript with decorator metadata enabled', () => {
    const user = new User();

    expect(user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('applies entity field defaults', () => {
    const user = new User();

    expect(user.avatarUrl).toBeNull();
    expect(user.jobTitle).toBeNull();
  });

  it('gives each entity a distinct id', () => {
    expect(new User().id).not.toEqual(new User().id);
  });
});
