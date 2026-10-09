# Release notes

## 0.1.2

- Triggers instead of bumpers: L2 = search, R2 = What's New / Friends / Recommended. L1 / R1 are left to Steam (they switch the tabs there).
- On the sections page, L2 goes back to the street.
- Ⓑ on the sections works like the stock home again: first to the top, then Steam's menu.

## 0.1.1

- Fixed: the street could show only the sky and the road, with no buildings and no penguin. Steam runs plugin code in a separate window with its own clock; the first frame got a huge negative time step and threw the camera away. The street now uses the clock of the window it draws in, and a bad frame can no longer move the camera or the penguin off to infinity.
- R1 now opens What's New / Friends / Recommended as a page that slides in from the right. Ⓑ (or a swipe to the right) goes back to the street.
- The bottom bar shows only the Ⓐ hint.

## 0.1.0

First test build.

- The Steam Deck home becomes a street: one storefront per game, with a baby penguin that walks to the one you pick.
- Ⓐ: the penguin goes in through the door and the game starts; it comes back out when you quit.
- L1: search. R1: What's New / Friends / Recommended.
- Themes: Minimi Town (sunny, sky follows the clock) and Neon Rain City (rainy night, CRT screens).
- Building states: recently played, new, not installed, downloading, dusty. Playtime tiers at 100 / 200 / 500 hours.
