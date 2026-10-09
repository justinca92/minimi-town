# Release notes

## 0.1.35

- Achievement medals: a game's storefront screen wears a medal on its top-right corner once you've unlocked 50% of its achievements (bronze), 80% (silver) or all of them (gold, with a laurel, a PERFECT ribbon and sparkles). Neon Rain City gets neon-rimmed medals. Playtime tiers still decide how grand the building itself is. The medal is pinned to the screen's frame, so it turns with the screen when you press Ⓧ, and on the back the achievement row takes the medal's colour. It swings harder when you shake the street (Ⓨ).
- Trackpad poke: a short click (under 0.2 s) pokes the penguin with a finger, just like tapping the touchscreen (poke it too much and it gets angry; in Neon Rain City it shoots). Click and hold, or click and move, still picks it up.

## 0.1.34

- Browsing with the left stick (or the D-pad) no longer buzzes the trackpads. The trackpad mode the penguin's hand needs (Steam's keyboard action set) adds pad haptics to stick movement, so it steps aside while you browse and comes back about a second after the stick rests.
- Neon Rain City's wet street really reflects now: the street above (windows, name signs, storefront screens, lamps, the penguin) mirrored on the ground, foreshortened, smeared down the way lights streak on wet asphalt, and rippling in the rain. The rough sidewalk shows a little, the road a lot, a few puddles hold a sharper mirror, and only the bright parts reflect.

## 0.1.33

- The trackpad hand has three poses: an open hand hovering while your thumb is on the pad, a palm-down hand patting the top of the head in time with your rubbing (토닥토닥, with little pat marks), and thumb and index pinching the top of the head when you grab.
- Neon Rain City's tough penguin doesn't do cute when you pet it: it leans away, looks off to the side with an unimpressed face and a blush, and mutters "…하지 마." / "…쳇." / "…5초만이다." — but stays put, and its mood still goes up. Keep going long enough and it admits "…나쁘진 않군." or "…아무한테도 말하지 마." Hearts are rare there.

## 0.1.32

- Trackpad flicks throw properly. The throw speed is now taken from the last moment your thumb actually moved (the pad only reports a lift after a short silence, which used to read as "standing still" and just dropped the penguin), and a pad touch-up lets go at once.
- Two ways to throw: flick and lift your thumb, or swipe while holding the click and let go of the click mid-swipe. A still thumb keeps holding; lift it slowly to put the penguin down.

## 0.1.31

- Left trackpad, done the way Spindeck's trackpad wheel does it (confirmed on device there): while the street has focus, the controller is put into Steam's keyboard action set with analog input on (as Steam's radial menu does, refreshed every second), so the left pad reports your thumb's position without a click (message type 48). Its touch and click reach the street as pad buttons, and the click grabs the penguin. The pad no longer moves along the street.
- That mode is switched off whenever the street isn't in front: sections, search box, a game page, the panel turned off, or the plugin unloaded.
- The trackpad diagnostic shows this path: analog mode on/off, the input types seen, pad position and pad button events.

## 0.1.30

- Left trackpad fix: it kept moving along the street and never reached the penguin. The pad is now read from every channel the Steam client offers (controller state, input messages, analog position, the UI's own pad events), and a D-pad press is held for a split second to check it didn't come from the pad, so a pad touch that's reported a moment late still doesn't move the street.
- New Quick Access toggle "Show trackpad diagnostic": a small live readout of what each channel sees, to send in if the pad still doesn't work on your device.

## 0.1.29

- The left trackpad is the penguin's hand now (Steam Deck, Steam Controller, Steam Machine): a cartoon glove appears while your thumb is on the pad. Rub without clicking to pet it (it cheers up); click to grab it, keep your thumb on the pad to carry it around, then flick and lift your thumb to throw it (lift slowly to just put it down). Left-pad clicks no longer move along the street; the D-pad still does.
- Street lamps in Neon Rain City also only throw their light down now (no round glow at the bulb or on the wall), like Minimi Town.
- The "퍽!" when the penguin hits a screen wall shows up beside it, on the inner side, and pop-up words never run off the screen edge.

## 0.1.28

- Neon Rain City's LED ticker pillars scroll just the words (GRAND OPENING, 축 개업 / GRATZ), no star marks.

## 0.1.27

- Neon Rain City's run-down shops: broken windows look like real broken glass now. Jagged cracks wander and fork out to the frame, from an impact off to one side, a long stress crack across the pane, or a piece fallen out. Some panes survived; each shop keeps the same cracks.

## 0.1.26

- Neon Rain City has its own GRAND OPENING now: two delivery drones hang a blinking light string over the storefront screen, a glitchy hologram banner is projected over the door, and LED ticker pillars scroll GRAND OPENING ✦ 축 개업 (GRATZ in English) on both sides of the door. Balloons and flower stands stay in Minimi Town.
- Neon Rain City shops you haven't played in months look run-down instead of cobwebbed: grime and rust streaks, cracked and boarded-up windows, torn posters and a spray tag by the door, litter on the pavement, and a neon tube that's mostly dead and only sputters now and then.

## 0.1.25

- Fixed: after bumping into either end of the street, the whole picture stayed shifted to one side, so the invisible walls the penguin bounces off sat closer to one screen edge than the other. The bump now springs back and both walls sit at the same distance from the edges.

## 0.1.24

- The info on the back of a storefront screen is never cut off: long names wrap onto more lines and everything shrinks just enough to show in full.
- The screen turns round only with Ⓧ now (no more turning by itself after 3 seconds).
- Neon Rain City: the little icon blade signs are gone, and the neon OPEN sign hangs on the shop's door instead of in the window.
- Minimi Town at dusk and night: street lamps only throw their light down (cone and pool); the round glow around the bulb and on the wall is gone.

## 0.1.23

- Flicking fast through the street: the penguin falls behind and drops out of the frame once, instead of being dragged along the screen edge (the ghost trail). No edge marker while you flick; about half a second after you stop it runs back in from the edge.

## 0.1.22

- The flower stands' ribbon reads GRATZ in English.

## 0.1.21

- Recently played shops hang a real OPEN sign: a little plate swinging on the door glass in Minimi Town, a classic window neon (blue frame, red letters) in Neon Rain City.
- New games celebrate a GRAND OPENING: a ribbon banner over the door and two congratulation flower stands (축 개업 / CONG), next to the balloons. The NEW tag and pennant string are gone.

## 0.1.20

- Ⓧ turns the picked shop's screen round to its info right away, and Ⓧ again turns it back (it then stays on the art while you rest there).

## 0.1.19

- Rest on a shop for 3 seconds and its storefront screen turns round to show the game's info on the back: icon and name, playtime, last played, achievements (with a progress bar) and friends playing. Move on and it turns back. A cream card in Minimi Town, a neon CRT card in Neon Rain City; works with both wide and tall screens.

## 0.1.18

- Shop signs show the game's name instead of the info icons (shrinks to fit, ends in "…" when it's very long): neon lettering in Neon Rain City, painted on the signboard in Minimi Town.

## 0.1.17

- Neon Rain City's blade signs are now small squares that fit the game's icon (no extra tubes or dots), each hung at its own height, always above the street lamps so a lamp never covers the icon.
- Going into a shop no longer switches its windows to pink: the light stays one steady colour while the penguin is inside (in both themes).

## 0.1.16

- Every shop now carries its own game info on its sign, with Spindeck's icons (playtime · last played · achievements · friends playing): a neon tube sign in Neon Rain City, a painted signboard under the storefront screen in Minimi Town. Items that don't fit are left off.
- Neon Rain City's vertical blade signs show the game's own icon in a neon frame instead of letters.
- The title and info at the top left are gone; the street itself says it now. Welcome pennants hang below the sign instead of over it.

## 0.1.15

- Flicking fast through the street (50 or 100 games in a row) no longer leaves a penguin trail: while you rush it stays inside the frame running alongside, doesn't trip, and kicks up no dust. A tumble that slides off-screen ends right away.
- Shop interior lights: Neon Rain City shops glow warm amber with a magenta falloff; Minimi Town shops are lit cool blue by day and stay warm at dusk and night.

## 0.1.14

- If the penguin falls behind off-screen (you browsed faster than it can run, or it was sulking at a shop you left), it pops back in at the screen edge already running within a third of a second.

## 0.1.13

- The penguin no longer hides behind buildings when it sulks; it just sits with its back to you.
- Flicking quickly through the street no longer leaves a trail of glowing shops and lamps behind: lights only come on once you rest on a shop, passed ones go dark at once, and the camera keeps up with you.

## 0.1.12

- Ⓐ always gets you in: a sulking or grumpy penguin grumbles ("Hmph… fine, I'm going.") but still walks in, and if it's mid-tumble (flung, dizzy, shooting) it goes as soon as it's back on its feet.

## 0.1.11

- The street (shops, lamps, road) sits 40 px lower, leaving room above for the game's name.
- The game's name and its info line are bigger, over a slightly darker shade under Steam's bar.
- Fixed: on a non-Steam game, "NOT PLAYED YET" flashed for a moment before its playtime appeared. A shortcut's playtime only exists in Steam's app details, which answer a moment later; until they do, no playtime is shown, and once seen it is remembered for the session.

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
