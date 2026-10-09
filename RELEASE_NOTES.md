# Release notes

## 0.1.10

- Neon Rain City: the penguin wears tactical gear instead of the police uniform: a short-sleeve shirt, a leather shoulder rig with a holster at each side and magazine pouches on the back, fingerless gloves, a belt with pouches, and a neon earpiece.
- The outfit is drawn around the body, so it carries on naturally from the front through the side to the back (the shoulder straps cross on the back, the neckline follows the turn).

## 0.1.9

- Neon Rain City: the penguin is a cop now: police cap with a gold badge and a neon band, a blue uniform jacket with a star badge and a duty belt, and "POLICE" on the back. Its toy blaster is always in hand (held low, raised when it chases or goes in).
- Its shots are neon lasers: a pink-and-cyan beam, then white-hot burns on the glass that cool to neon and fade.

## 0.1.8

- The lamps fade between 30% and full at the pace you browse: resting on a shop, its lamp warms up over about a second; flicking quickly through the street, the light speeds up to keep up with you.

## 0.1.7

- Only the lamp over the picked shop burns full; the others are dimmed to 30%, and the light follows you along the street.
- Steam's search box: R2 takes you back to the street; Ⓑ opens Steam's menu and leaves you in the search box; L2 does nothing there.

## 0.1.6

- What's New / Friends / Recommended: the tab row and Steam's top bar share one opaque background again, exactly like Spindeck.
- Steam's search box (opened with L2): L2 or R2 brings you back to the street, and Ⓑ leaves the box and opens Steam's menu.
- Fixed: a detached leftover copy of the home could keep Steam's top bar see-through on the sections page (and keep running in the background).

## 0.1.5

- Street lamps stand in front of the shops, a little lower than the roofs. When they're lit (dusk, night, and always in Neon Rain City) each throws a cone of light down onto the shop front and a pool onto the pavement.
- A picked shop's lights come up smoothly (no flicker).
- Neon Rain City: the penguin draws a toy neon blaster when it runs after you, stops at the door with a grim "Going in." before entering, and if you keep poking it, it shoots the screen three times (laser dot, flash, cracks in the glass that fade).

## 0.1.4

- Ⓐ: the penguin goes in through the door and the game's page opens. Nothing starts by itself any more; Play is on that page.
- Back from the game page (or search), the same game is still picked, and the penguin steps out of its door.
- The picked game's name and info now sit top-left under Steam's bar, with Spindeck's icon line: playtime, last played, achievements (with a bar), friends playing, plus state and playtime tier where they apply.
- The road's centre line is back in its place, toned down to grey.

## 0.1.3

- D-pad ▲ / ▼ never switch between the street and the sections any more (only R2 / L2 do).
- The sections page leaves Steam's top bar (profile, Wi-Fi, battery, clock) exactly as Steam paints it; the tab row sits below it.
- The selected game is written on the road as plain text instead of a panel.
- Lights: a building's windows are dark until you pick it, then the lights flicker on.
- New panel option "Storefront screens": wide capsule (460×215) or tall capsule (600×900), always shown whole.

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
