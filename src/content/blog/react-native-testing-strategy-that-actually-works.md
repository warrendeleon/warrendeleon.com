---
title: "A React Native testing strategy that actually works"
description: "How I structure unit, integration, and E2E tests in React Native projects. Practical patterns from real production apps."
publishDate: 2026-03-26
tags: ["react-native", "testing", "typescript", "tutorial"]
heroImage: "/images/blog/react-native-testing.jpg"
heroAlt: "React Native testing strategy"
---

## Why most React Native test suites fail

Lorem ipsum dolor sit amet, consectetur adipiscing elit. The problem isn't that teams don't write tests. It's that they write the wrong tests. Snapshot tests that break on every minor UI change. Unit tests that mock everything and prove nothing. E2E tests that take 45 minutes and flake on CI.

Here's the approach I've used across multiple production apps at Sky, Shell, and BP.

## The testing pyramid for React Native

I follow a modified testing pyramid:

- **Unit tests** (60%): Redux slices, selectors, utility functions, hooks
- **Component tests** (25%): Render components with React Native Testing Library, test user interactions
- **E2E tests** (15%): Critical user journeys only, using Detox

### Unit tests: test the logic, not the framework

The most valuable unit tests are the ones that test your business logic in isolation.

```typescript
// store/partySlice.test.ts
import { pokemonReducer, addToParty } from './pokemonSlice';

describe('addToParty', () => {
  it('blocks adding a 7th Pokemon when party is full', () => {
    const fullParty = {
      ...initialState,
      party: Array.from({ length: 6 }, (_, i) => makePokemon(i)),
    };

    const result = pokemonReducer(
      fullParty,
      addToParty(makePokemon(7))
    );

    expect(result.party).toHaveLength(6);
  });
});
```

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Notice we're testing the reducer directly, not rendering a component. The logic is what matters here.

### Selectors deserve their own tests

```typescript
// store/selectors.test.ts
import { selectPokemonById, isPartyFull } from './selectors';

describe('isPartyFull', () => {
  it('returns true when party has 6 members', () => {
    const state = buildState({
      party: Array.from({ length: 6 }, (_, i) => makePokemon(i)),
    });
    expect(isPartyFull(state)).toBe(true);
  });

  it('returns false when party has fewer than 6', () => {
    const state = buildState({ party: [makePokemon(1)] });
    expect(isPartyFull(state)).toBe(false);
  });
});
```

Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris. Selectors are pure functions. They're trivial to test and the tests never flake.

### Component tests: test behaviour, not implementation

```typescript
// components/PokemonCard.test.tsx
import { render, fireEvent, screen } from '@testing-library/react-native';
import { PokemonCard } from './PokemonCard';

it('calls onPress when tapped', () => {
  const onPress = jest.fn();
  render(
    <PokemonCard
      pokemon={{ id: 1, name: 'Bulbasaur' }}
      onPress={onPress}
    />
  );

  fireEvent.press(screen.getByText('Bulbasaur'));
  expect(onPress).toHaveBeenCalledTimes(1);
});
```

Lorem ipsum dolor sit amet. The key principle: test what the user sees and does, not internal state or implementation details.

## E2E with Detox: less is more

Excepteur sint occaecat cupidatat non proident. Only test critical user journeys:

1. User can browse the list and open a detail screen
2. User can add to party and see the count update
3. User can remove from party

```typescript
// e2e/party.test.ts
describe('Party management', () => {
  it('should add a Pokemon to the party', async () => {
    await element(by.text('Bulbasaur')).tap();
    await element(by.text('Add to Party')).tap();
    await expect(element(by.text('1/6'))).toBeVisible();
  });
});
```

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.

## The test config that ties it together

```javascript
// jest.config.js
module.exports = {
  preset: 'react-native',
  setupFilesAfterSetup: [
    '@testing-library/jest-native/extend-expect',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
  ],
};
```

---

This strategy has consistently delivered 75%+ coverage across my projects without slowing down development. The secret isn't writing more tests. It's writing the right tests at the right level.
